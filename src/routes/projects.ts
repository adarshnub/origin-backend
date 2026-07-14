import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projectCollaborators, projects, sceneVersions, scenes, users } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { accessibleWorkspaceIds, requireProjectRole, requireWorkspaceRole } from "../services/access-service.js";
import { presentScenes } from "../services/scene-presenter.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const workspaceIds = await accessibleWorkspaceIds(req.auth!.userId);
  if (!workspaceIds.length) return sendData(res, []);
  const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
  const rows = await db.select().from(projects).where(and(
    inArray(projects.workspaceId, workspaceIds), isNull(projects.deletedAt),
    search ? ilike(projects.name, `%${search}%`) : undefined,
  )).orderBy(desc(projects.updatedAt)).limit(100);
  return sendData(res, rows, 200, { total: rows.length });
});

router.post("/", validateBody(z.object({ workspaceId: z.uuid(), name: z.string().trim().min(1).max(120), description: z.string().max(1000).default("") })), async (req, res) => {
  await requireWorkspaceRole(req.auth!.userId, req.body.workspaceId, "editor");
  const [project] = await db.insert(projects).values({ ...req.body, createdBy: req.auth!.userId }).returning();
  return sendData(res, project, 201);
});

router.get("/:projectId", async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "viewer");
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const projectScenes = await db.select().from(scenes).where(and(eq(scenes.projectId, project.id), isNull(scenes.deletedAt))).orderBy(asc(scenes.sortKey));
  return sendData(res, { ...project, scenes: await presentScenes(projectScenes) });
});

router.patch("/:projectId", validateBody(z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(1000).optional(), thumbnailUrl: z.url().nullable().optional() })), async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "editor");
  const [project] = await db.update(projects).set({ ...req.body, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
  return sendData(res, project);
});

router.delete("/:projectId", async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "admin");
  await db.update(projects).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, projectId));
  return sendData(res, { deleted: true });
});

router.get("/:projectId/collaborators", async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "viewer");
  const rows = await db.select({ userId: users.id, email: users.email, displayName: users.displayName, role: projectCollaborators.role })
    .from(projectCollaborators).innerJoin(users, eq(users.id, projectCollaborators.userId)).where(eq(projectCollaborators.projectId, projectId));
  return sendData(res, rows);
});

router.post("/:projectId/collaborators", validateBody(z.object({ email: z.email(), role: z.enum(["editor", "viewer"]) })), async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "admin");
  const [user] = await db.select().from(users).where(eq(users.email, req.body.email.trim().toLowerCase())).limit(1);
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "No account exists for this email address.");
  const [collaborator] = await db.insert(projectCollaborators).values({ projectId, userId: user.id, role: req.body.role })
    .onConflictDoUpdate({ target: [projectCollaborators.projectId, projectCollaborators.userId], set: { role: req.body.role } }).returning();
  return sendData(res, { ...collaborator, email: user.email, displayName: user.displayName }, 201);
});

router.delete("/:projectId/collaborators/:userId", async (req, res) => {
  const projectId = req.params.projectId as string;
  const userId = req.params.userId as string;
  await requireProjectRole(req.auth!.userId, projectId, "admin");
  await db.delete(projectCollaborators).where(and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId)));
  return sendData(res, { removed: true });
});

router.post("/:projectId/scenes", validateBody(z.object({ title: z.string().trim().min(1).max(120), kind: z.enum(["image", "video", "audio", "document", "plan"]).default("image"), prompt: z.string().max(10_000).default("") })), async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "editor");
  const result = await db.transaction(async (tx) => {
    const [last] = await tx.select({ sortKey: scenes.sortKey }).from(scenes).where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt))).orderBy(desc(scenes.sortKey)).limit(1);
    const [scene] = await tx.insert(scenes).values({ projectId, title: req.body.title, sortKey: String(Number(last?.sortKey ?? 0) + 1), createdBy: req.auth!.userId }).returning();
    if (!scene) throw new Error("Scene insert failed");
    const [version] = await tx.insert(sceneVersions).values({ sceneId: scene.id, kind: req.body.kind, prompt: req.body.prompt, createdBy: req.auth!.userId }).returning();
    await tx.update(scenes).set({ currentVersionId: version?.id }).where(eq(scenes.id, scene.id));
    await tx.update(projects).set({ revision: sql`${projects.revision} + 1`, updatedAt: new Date() }).where(eq(projects.id, projectId));
    return { ...scene, currentVersionId: version?.id, currentVersion: version, version, playback: null };
  });
  req.app.get("io")?.to(`project:${projectId}`).emit("scene:created", result);
  return sendData(res, result, 201);
});

router.put("/:projectId/sequence", validateBody(z.object({ expectedRevision: z.number().int().nonnegative(), sceneIds: z.array(z.uuid()).max(500) })), async (req, res) => {
  const projectId = req.params.projectId as string;
  await requireProjectRole(req.auth!.userId, projectId, "editor");
  const [project] = await db.select({ revision: projects.revision }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.revision !== req.body.expectedRevision) {
    const canonical = await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt))).orderBy(asc(scenes.sortKey));
    return res.status(409).json({ data: { revision: project.revision, sceneIds: canonical.map((scene) => scene.id) }, error: { code: "REVISION_CONFLICT", message: "The project changed. Reconcile against the canonical sequence." }, meta: {} });
  }
  await db.transaction(async (tx) => {
    await Promise.all(req.body.sceneIds.map((id: string, index: number) => tx.update(scenes).set({ sortKey: String(index + 1), updatedAt: new Date() }).where(and(eq(scenes.id, id), eq(scenes.projectId, projectId)))));
    await tx.update(projects).set({ revision: project.revision + 1, updatedAt: new Date() }).where(eq(projects.id, projectId));
  });
  const payload = { sceneIds: req.body.sceneIds, revision: project.revision + 1 };
  req.app.get("io")?.to(`project:${projectId}`).emit("scene:reordered", payload);
  return sendData(res, payload);
});

export const projectsRouter = router;
