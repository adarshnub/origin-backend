import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { sendData } from "../lib/api.js";
import { validateBody } from "../middleware/validate.js";
import { authenticateUser, registerUser, requestPasswordReset, resetPassword, verifyEmail } from "../services/auth-service.js";
import { createSession, revokeSession } from "../services/session-service.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const password = z.string().min(12).max(128).regex(/[A-Z]/, "Include an uppercase letter").regex(/[a-z]/, "Include a lowercase letter").regex(/[0-9]/, "Include a number");

router.post("/signup", authLimiter, validateBody(z.object({
  email: z.email().max(254),
  password,
  displayName: z.string().trim().min(2).max(80),
})), async (req, res) => sendData(res, await registerUser(req.body), 201));

router.post("/verify-email", authLimiter, validateBody(z.object({ token: z.string().min(20).max(256) })), async (req, res) => {
  await verifyEmail(req.body.token);
  return sendData(res, { verified: true });
});

router.post("/login", authLimiter, validateBody(z.object({ email: z.email(), password: z.string().min(1).max(128) })), async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);
  const session = await createSession(user.id, req, res);
  return sendData(res, { user: { id: user.id, email: user.email, displayName: user.displayName }, csrfToken: session.csrfToken });
});

router.get("/session", (req, res) => sendData(res, {
  user: req.auth ? { id: req.auth.userId, email: req.auth.email, displayName: req.auth.displayName, isGlobalAdmin: req.auth.isGlobalAdmin } : null,
  csrfToken: req.cookies?.[`${env.SESSION_COOKIE_NAME}_csrf`] ?? null,
}));

router.post("/logout", requireAuth, async (req, res) => {
  await revokeSession(req.auth?.sessionId, res);
  return sendData(res, { signedOut: true });
});

router.post("/forgot-password", authLimiter, validateBody(z.object({ email: z.email() })), async (req, res) => {
  await requestPasswordReset(req.body.email);
  return sendData(res, { accepted: true });
});

router.post("/reset-password", authLimiter, validateBody(z.object({ token: z.string().min(20).max(256), password })), async (req, res) => {
  await resetPassword(req.body.token, req.body.password);
  return sendData(res, { reset: true });
});

export const authRouter = router;
