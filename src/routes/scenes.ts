import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { assets, projects, sceneVersions, scenes } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireProjectRole } from "../services/access-service.js";
import { presentScenes } from "../services/scene-presenter.js";

const router = Router();
router.use(requireAuth);

async function sceneProject(sceneId: string) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  if (!scene) throw new AppError(404, "SCENE_NOT_FOUND", "Scene not found.");
  return scene;
}

router.get("/:sceneId/versions", async (req, res) => {
  const scene = await sceneProject(req.params.sceneId as string);
  await requireProjectRole(req.auth!.userId, scene.projectId, "viewer");
  const versions = await db.select().from(sceneVersions).where(eq(sceneVersions.sceneId, scene.id)).orderBy(desc(sceneVersions.createdAt));
  return sendData(res, versions);
});

router.post("/:sceneId/versions", validateBody(z.object({
  parentVersionId: z.uuid().nullable().optional(),
  kind: z.enum(["image", "video", "audio", "document", "plan"]),
  prompt: z.string().max(10_000).default(""),
  settings: z.record(z.string(), z.unknown()).default({}),
  inputAssetIds: z.array(z.uuid()).max(50).default([]),
  outputAssetIds: z.array(z.uuid()).max(50).default([]),
  status: z.enum(["draft", "processing", "ready", "failed"]).default("ready"),
})), async (req, res) => {
  const scene = await sceneProject(req.params.sceneId as string);
  const project = await requireProjectRole(req.auth!.userId, scene.projectId, "editor");
  const referencedAssetIds = [...new Set([...req.body.inputAssetIds, ...req.body.outputAssetIds])];
  if (referencedAssetIds.length) {
    const rows = await db.select({ id: assets.id }).from(assets).where(and(
      inArray(assets.id, referencedAssetIds),
      eq(assets.workspaceId, project.workspaceId),
      isNull(assets.deletedAt),
    ));
    if (rows.length !== referencedAssetIds.length) {
      throw new AppError(422, "ASSET_REFERENCE_INVALID", "One or more assets cannot be used in this scene.");
    }
  }

  const result = await db.transaction(async (tx) => {
    const [version] = await tx.insert(sceneVersions).values({ ...req.body, parentVersionId: req.body.parentVersionId ?? scene.currentVersionId, sceneId: scene.id, createdBy: req.auth!.userId }).returning();
    if (!version) throw new Error("Scene version insert failed");
    await tx.update(scenes).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
    await tx.update(projects).set({ revision: sql`${projects.revision} + 1`, updatedAt: new Date() }).where(eq(projects.id, scene.projectId));
    return version;
  });
  const [presented] = await presentScenes([{ ...scene, currentVersionId: result.id, updatedAt: new Date() }]);
  req.app.get("io")?.to(`project:${scene.projectId}`).emit("version:created", { sceneId: scene.id, versionId: result.id });
  return sendData(res, { ...result, scene: presented }, 201);
});

router.post("/:sceneId/versions/:versionId/make-current", async (req, res) => {
  const scene = await sceneProject(req.params.sceneId as string);
  await requireProjectRole(req.auth!.userId, scene.projectId, "editor");
  const [version] = await db.select().from(sceneVersions).where(eq(sceneVersions.id, req.params.versionId as string)).limit(1);
  if (!version || version.sceneId !== scene.id) throw new AppError(404, "VERSION_NOT_FOUND", "Version not found.");
  await db.update(scenes).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
  req.app.get("io")?.to(`project:${scene.projectId}`).emit("version:selected", { sceneId: scene.id, versionId: version.id });
  return sendData(res, { sceneId: scene.id, versionId: version.id });
});

export const scenesRouter = router;
