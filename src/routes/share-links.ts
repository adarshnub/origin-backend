import { Router } from "express";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projects, shareLinks } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { createOpaqueToken, hashToken } from "../lib/crypto.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireProjectRole } from "../services/access-service.js";

const router = Router();

router.get("/:token", async (req, res) => {
  const token = req.params.token as string;
  const [row] = await db.select({ link: shareLinks, project: projects }).from(shareLinks).innerJoin(projects, eq(projects.id, shareLinks.projectId)).where(and(
    eq(shareLinks.tokenHash, hashToken(token)), isNull(shareLinks.revokedAt), or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date())),
  )).limit(1);
  if (!row) throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Share link not found or expired.");
  return sendData(res, { project: { id: row.project.id, name: row.project.name, thumbnailUrl: row.project.thumbnailUrl }, role: row.link.role });
});

router.use(requireAuth);
router.post("/", validateBody(z.object({ projectId: z.uuid(), role: z.enum(["viewer", "commenter"]).default("viewer"), expiresAt: z.coerce.date().nullable().optional() })), async (req, res) => {
  await requireProjectRole(req.auth!.userId, req.body.projectId, "admin");
  const token = createOpaqueToken();
  const [link] = await db.insert(shareLinks).values({ projectId: req.body.projectId, role: req.body.role, expiresAt: req.body.expiresAt ?? null, tokenHash: hashToken(token), createdBy: req.auth!.userId }).returning();
  return sendData(res, { ...link, token }, 201);
});

router.delete("/:shareLinkId", async (req, res) => {
  const id = req.params.shareLinkId as string;
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1);
  if (!link) throw new AppError(404, "SHARE_LINK_NOT_FOUND", "Share link not found.");
  await requireProjectRole(req.auth!.userId, link.projectId, "admin");
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, id));
  return sendData(res, { revoked: true });
});

export const shareLinksRouter = router;
