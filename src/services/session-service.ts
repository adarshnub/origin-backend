import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { createOpaqueToken, hashToken } from "../lib/crypto.js";

const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ttlMs,
    path: "/",
  };
}

export async function createSession(userId: string, req: Request, res: Response) {
  const token = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const [session] = await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    csrfHash: hashToken(csrfToken),
    userAgent: req.header("user-agent")?.slice(0, 500),
    ipAddress: req.ip,
    expiresAt: new Date(Date.now() + ttlMs),
  }).returning({ id: sessions.id });

  res.cookie(env.SESSION_COOKIE_NAME, token, cookieOptions(true));
  res.cookie(`${env.SESSION_COOKIE_NAME}_csrf`, csrfToken, cookieOptions(false));
  return { sessionId: session?.id, csrfToken };
}

export async function revokeSession(sessionId: string | undefined, res: Response) {
  if (sessionId) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
  res.clearCookie(`${env.SESSION_COOKIE_NAME}_csrf`, { path: "/" });
}
