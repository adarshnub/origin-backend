import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { hashToken } from "../lib/crypto.js";
import { AppError } from "../lib/api.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  if (safeMethods.has(req.method) || !req.auth) return next();
  const token = req.header("x-csrf-token");
  const cookie = req.cookies?.[`${env.SESSION_COOKIE_NAME}_csrf`] as string | undefined;
  if (!token || !cookie || token !== cookie || hashToken(token) !== req.auth.csrfHash) {
    return next(new AppError(403, "CSRF_INVALID", "The security token is invalid. Refresh and try again."));
  }
  next();
}
