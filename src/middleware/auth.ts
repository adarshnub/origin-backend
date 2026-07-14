import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { hashToken } from "../lib/crypto.js";
import { AppError } from "../lib/api.js";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) return next();

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      csrfHash: sessions.csrfHash,
      isGlobalAdmin: users.isGlobalAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(rawToken)), gt(sessions.expiresAt, new Date()), isNull(sessions.revokedAt)))
    .limit(1);

  const session = rows[0];
  if (session) req.auth = session;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new AppError(401, "AUTH_REQUIRED", "Please sign in to continue."));
  next();
}
