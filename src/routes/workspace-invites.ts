import { Router } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, workspaceInvites, workspaceMembers } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { createOpaqueToken, hashToken } from "../lib/crypto.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireWorkspaceRole } from "../services/access-service.js";
import { sendWorkspaceInviteEmail } from "../services/email-service.js";

const router = Router();
router.use(requireAuth);

router.post("/", validateBody(z.object({ workspaceId: z.uuid(), email: z.email().max(254), role: z.enum(["admin", "editor", "viewer"]) })), async (req, res) => {
  await requireWorkspaceRole(req.auth!.userId, req.body.workspaceId, "admin");
  const token = createOpaqueToken();
  const email = req.body.email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const [invite] = await db.insert(workspaceInvites).values({ ...req.body, email, tokenHash: hashToken(token), invitedBy: req.auth!.userId, expiresAt })
    .onConflictDoUpdate({ target: [workspaceInvites.workspaceId, workspaceInvites.email], set: { role: req.body.role, tokenHash: hashToken(token), invitedBy: req.auth!.userId, expiresAt, acceptedAt: null } }).returning();
  await sendWorkspaceInviteEmail(email, token);
  return sendData(res, invite, 201);
});

router.post("/accept", validateBody(z.object({ token: z.string().min(20).max(256) })), async (req, res) => {
  const [invite] = await db.select().from(workspaceInvites).where(and(eq(workspaceInvites.tokenHash, hashToken(req.body.token)), gt(workspaceInvites.expiresAt, new Date()), isNull(workspaceInvites.acceptedAt))).limit(1);
  if (!invite) throw new AppError(400, "INVITE_INVALID", "This invitation is invalid or expired.");
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, req.auth!.userId)).limit(1);
  if (!user || user.email !== invite.email) throw new AppError(403, "INVITE_EMAIL_MISMATCH", "Sign in with the invited email address.");
  await db.transaction(async (tx) => {
    await tx.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId: req.auth!.userId, role: invite.role }).onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role: invite.role } });
    await tx.update(workspaceInvites).set({ acceptedAt: new Date() }).where(eq(workspaceInvites.id, invite.id));
  });
  return sendData(res, { accepted: true, workspaceId: invite.workspaceId });
});

export const workspaceInvitesRouter = router;
