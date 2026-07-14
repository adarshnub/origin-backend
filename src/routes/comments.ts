import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { commentMentions, comments } from "../db/schema/index.js";
import { sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireProjectRole } from "../services/access-service.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const projectId = z.uuid().parse(req.query.projectId);
  await requireProjectRole(req.auth!.userId, projectId, "viewer");
  return sendData(res, await db.select().from(comments).where(eq(comments.projectId, projectId)));
});

router.post("/", validateBody(z.object({
  projectId: z.uuid(), parentId: z.uuid().nullable().optional(),
  targetType: z.enum(["project", "scene", "scene_version", "asset", "timestamp"]), targetId: z.string().max(100).nullable().optional(),
  timestampMs: z.number().int().nonnegative().nullable().optional(), body: z.string().trim().min(1).max(5000), mentionUserIds: z.array(z.uuid()).max(25).default([]),
})), async (req, res) => {
  await requireProjectRole(req.auth!.userId, req.body.projectId, "viewer");
  const { mentionUserIds, ...commentBody } = req.body;
  const comment = await db.transaction(async (tx) => {
    const [created] = await tx.insert(comments).values({ ...commentBody, parentId: req.body.parentId ?? null, targetId: req.body.targetId ?? null, timestampMs: req.body.timestampMs ?? null, authorId: req.auth!.userId }).returning();
    if (!created) throw new Error("Comment insert failed");
    if (mentionUserIds.length) await tx.insert(commentMentions).values(mentionUserIds.map((userId: string) => ({ commentId: created.id, userId })));
    return created;
  });
  req.app.get("io")?.to(`project:${req.body.projectId}`).emit("comment:created", comment);
  return sendData(res, comment, 201);
});

router.post("/:commentId/resolve", async (req, res) => {
  const commentId = req.params.commentId as string;
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) return res.status(404).json({ data: null, error: { code: "COMMENT_NOT_FOUND", message: "Comment not found." }, meta: {} });
  await requireProjectRole(req.auth!.userId, comment.projectId, "viewer");
  const [resolved] = await db.update(comments).set({ resolvedAt: new Date(), resolvedBy: req.auth!.userId, updatedAt: new Date() }).where(eq(comments.id, commentId)).returning();
  req.app.get("io")?.to(`project:${comment.projectId}`).emit("comment:resolved", resolved);
  return sendData(res, resolved);
});

export const commentsRouter = router;
