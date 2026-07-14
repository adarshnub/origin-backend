import type { Server as HttpServer } from "node:http";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/postgres-adapter";
import { db, pool } from "../db/client.js";
import { sessions, users } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { hashToken } from "../lib/crypto.js";
import { requireProjectRole } from "../services/access-service.js";

function cookieValue(header: string | undefined, name: string) {
  const part = header?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}

export async function configureSocket(server: HttpServer) {
  const io = new Server(server, { cors: { origin: env.APP_ORIGIN, credentials: true } });
  io.adapter(createAdapter(pool));

  io.use(async (socket, next) => {
    const token = cookieValue(socket.handshake.headers.cookie, env.SESSION_COOKIE_NAME);
    if (!token) return next(new Error("Authentication required"));
    const [row] = await db.select({ userId: users.id, sessionId: sessions.id }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(sessions.revokedAt))).limit(1);
    if (!row) return next(new Error("Authentication required"));
    socket.data.userId = row.userId;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("project:join", async (projectId: string, acknowledge?: (payload: unknown) => void) => {
      try {
        await requireProjectRole(String(socket.data.userId), projectId, "viewer");
        await socket.join(`project:${projectId}`);
        socket.to(`project:${projectId}`).emit("presence:joined", { userId: socket.data.userId });
        acknowledge?.({ ok: true });
      } catch {
        acknowledge?.({ ok: false, error: "Project access denied" });
      }
    });

    socket.on("presence:update", (payload: { projectId: string; view: string; sceneId?: string }) => {
      socket.to(`project:${payload.projectId}`).emit("presence:updated", { ...payload, userId: socket.data.userId });
    });
  });
  return io;
}
