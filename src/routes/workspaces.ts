import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { workspaceMembers, workspaces } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { slugify } from "../lib/slug.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireWorkspaceRole } from "../services/access-service.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await db.select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, req.auth!.userId));
  return sendData(res, rows.map((row) => ({ ...row.workspace, role: row.role })));
});

router.post("/", validateBody(z.object({ name: z.string().trim().min(2).max(80) })), async (req, res) => {
  const result = await db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({
      name: req.body.name,
      slug: `${slugify(req.body.name)}-${crypto.randomUUID().slice(0, 8)}`,
      kind: "team",
    }).returning();
    if (!workspace) throw new Error("Workspace insert failed");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: req.auth!.userId, role: "owner" });
    return workspace;
  });
  return sendData(res, { ...result, role: "owner" }, 201);
});

router.get("/:workspaceId/members", async (req, res) => {
  const own = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, req.params.workspaceId), eq(workspaceMembers.userId, req.auth!.userId))).limit(1);
  if (!own.length) return res.status(403).json({ data: null, error: { code: "FORBIDDEN", message: "Workspace access denied." }, meta: {} });
  const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, req.params.workspaceId));
  return sendData(res, rows);
});

router.patch("/:workspaceId/members/:userId", validateBody(z.object({ role: z.enum(["owner", "admin", "editor", "viewer"]) })), async (req, res) => {
  const workspaceId = req.params.workspaceId as string;
  const userId = req.params.userId as string;
  const actorRole = await requireWorkspaceRole(req.auth!.userId, workspaceId, "admin");
  const [target] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Workspace member not found.");
  if ((target.role === "owner" || req.body.role === "owner") && actorRole !== "owner") throw new AppError(403, "OWNER_REQUIRED", "Only an owner may change ownership.");
  await db.update(workspaceMembers).set({ role: req.body.role }).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return sendData(res, { userId, role: req.body.role });
});

router.delete("/:workspaceId/members/:userId", async (req, res) => {
  const workspaceId = req.params.workspaceId as string;
  const userId = req.params.userId as string;
  const actorRole = await requireWorkspaceRole(req.auth!.userId, workspaceId, "admin");
  const [target] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Workspace member not found.");
  if (target.role === "owner" && actorRole !== "owner") throw new AppError(403, "OWNER_REQUIRED", "Only an owner may remove an owner.");
  await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return sendData(res, { removed: true });
});

export const workspacesRouter = router;
