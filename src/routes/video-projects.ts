import { Router } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { timelineDocumentSchema } from "../contracts/timeline.js";
import { db } from "../db/client.js";
import { renderJobs, videoProjects, videoProjectVersions } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getBoss } from "../queues/jobs.js";
import { accessibleWorkspaceIds, requireWorkspaceRole } from "../services/access-service.js";

const router = Router();
router.use(requireAuth);
const emptyTimeline = { schemaVersion: 1 as const, durationMs: 30_000, tracks: [{ id: "video-1", kind: "video" as const, name: "Video" }, { id: "audio-1", kind: "audio" as const, name: "Audio" }, { id: "captions-1", kind: "caption" as const, name: "Captions" }], items: [], output: { width: 1920, height: 1080, fps: 30 } };

router.get("/", async (req, res) => {
  const ids = await accessibleWorkspaceIds(req.auth!.userId);
  if (!ids.length) return sendData(res, []);
  const rows = await db.select().from(videoProjects).where(and(inArray(videoProjects.workspaceId, ids), isNull(videoProjects.deletedAt))).orderBy(desc(videoProjects.updatedAt)).limit(100);
  return sendData(res, rows);
});

router.post("/", validateBody(z.object({ workspaceId: z.uuid(), name: z.string().trim().min(1).max(120).default("Untitled edit"), sourceProjectId: z.uuid().nullable().optional() })), async (req, res) => {
  await requireWorkspaceRole(req.auth!.userId, req.body.workspaceId, "editor");
  const result = await db.transaction(async (tx) => {
    const [project] = await tx.insert(videoProjects).values({ ...req.body, sourceProjectId: req.body.sourceProjectId ?? null, createdBy: req.auth!.userId }).returning();
    if (!project) throw new Error("Video project insert failed");
    const [version] = await tx.insert(videoProjectVersions).values({ videoProjectId: project.id, timeline: emptyTimeline, createdBy: req.auth!.userId }).returning();
    await tx.update(videoProjects).set({ currentVersionId: version?.id }).where(eq(videoProjects.id, project.id));
    return { ...project, currentVersionId: version?.id, timeline: emptyTimeline };
  });
  return sendData(res, result, 201);
});

router.get("/:videoProjectId", async (req, res) => {
  const [project] = await db.select().from(videoProjects).where(and(eq(videoProjects.id, req.params.videoProjectId as string), isNull(videoProjects.deletedAt))).limit(1);
  if (!project) throw new AppError(404, "VIDEO_PROJECT_NOT_FOUND", "Video project not found.");
  await requireWorkspaceRole(req.auth!.userId, project.workspaceId, "viewer");
  const [version] = project.currentVersionId ? await db.select().from(videoProjectVersions).where(eq(videoProjectVersions.id, project.currentVersionId)).limit(1) : [];
  return sendData(res, { ...project, timeline: version?.timeline ?? emptyTimeline });
});

router.post("/:videoProjectId/versions", validateBody(z.object({ parentVersionId: z.uuid().nullable().optional(), timeline: timelineDocumentSchema })), async (req, res) => {
  const [project] = await db.select().from(videoProjects).where(eq(videoProjects.id, req.params.videoProjectId as string)).limit(1);
  if (!project) throw new AppError(404, "VIDEO_PROJECT_NOT_FOUND", "Video project not found.");
  await requireWorkspaceRole(req.auth!.userId, project.workspaceId, "editor");
  const [version] = await db.insert(videoProjectVersions).values({ videoProjectId: project.id, parentVersionId: req.body.parentVersionId ?? project.currentVersionId, timeline: req.body.timeline, createdBy: req.auth!.userId }).returning();
  await db.update(videoProjects).set({ currentVersionId: version?.id, updatedAt: new Date() }).where(eq(videoProjects.id, project.id));
  return sendData(res, version, 201);
});

router.post("/:videoProjectId/render-jobs", async (req, res) => {
  const [project] = await db.select().from(videoProjects).where(eq(videoProjects.id, req.params.videoProjectId as string)).limit(1);
  if (!project?.currentVersionId) throw new AppError(404, "VIDEO_PROJECT_NOT_FOUND", "Video project or timeline not found.");
  await requireWorkspaceRole(req.auth!.userId, project.workspaceId, "editor");
  const [job] = await db.insert(renderJobs).values({ videoProjectId: project.id, versionId: project.currentVersionId, createdBy: req.auth!.userId }).returning();
  if (!job) throw new Error("Render job insert failed");
  const boss = await getBoss();
  await boss.send("render", { renderJobId: job.id }, { id: job.id, retryLimit: 2 });
  return sendData(res, job, 202);
});

router.delete("/:videoProjectId", async (req, res) => {
  const [project] = await db.select().from(videoProjects).where(eq(videoProjects.id, req.params.videoProjectId as string)).limit(1);
  if (!project) throw new AppError(404, "VIDEO_PROJECT_NOT_FOUND", "Video project not found.");
  await requireWorkspaceRole(req.auth!.userId, project.workspaceId, "admin");
  await db.update(videoProjects).set({ deletedAt: new Date() }).where(eq(videoProjects.id, project.id));
  return sendData(res, { deleted: true });
});

export const videoProjectsRouter = router;
