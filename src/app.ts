import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { optionalAuth } from "./middleware/auth.js";
import { requireCsrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { commentsRouter } from "./routes/comments.js";
import { costsRouter } from "./routes/costs.js";
import { generationRouter } from "./routes/generation.js";
import { projectsRouter } from "./routes/projects.js";
import { scenesRouter } from "./routes/scenes.js";
import { uploadsRouter } from "./routes/uploads.js";
import { videoProjectsRouter } from "./routes/video-projects.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { workspaceInvitesRouter } from "./routes/workspace-invites.js";
import { shareLinksRouter } from "./routes/share-links.js";
import { openApiDocument } from "./openapi.js";
import { providerHealth } from "./providers/registry.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(pinoHttp());
  app.use(optionalAuth);
  app.use(requireCsrf);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "origin-api" }));
  app.get("/ready", (_req, res) => res.json({ status: "ready", providers: providerHealth() }));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/workspaces", workspacesRouter);
  app.use("/api/v1/workspace-invites", workspaceInvitesRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1/assets", assetsRouter);
  app.use("/api/v1/scenes", scenesRouter);
  app.use("/api/v1", generationRouter);
  app.use("/api/v1/uploads", uploadsRouter);
  app.use("/api/v1/video-projects", videoProjectsRouter);
  app.use("/api/v1/comments", commentsRouter);
  app.use("/api/v1/costs", costsRouter);
  app.use("/api/v1/share-links", shareLinksRouter);

  app.use((_req, res) => res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Route not found." }, meta: {} }));
  app.use(errorHandler);
  return app;
}
