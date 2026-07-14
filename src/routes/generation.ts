import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { assets, assetVersions, generationJobs, generationOutputs, projects, sceneVersions, scenes, shotDesignRuns, providerModels } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getBoss } from "../queues/jobs.js";
import { requireProjectRole } from "../services/access-service.js";
import { presentScenes } from "../services/scene-presenter.js";
import { createPlaybackUrl, extensionForMime, uploadToStorage } from "../services/storage-service.js";

const router = Router();
router.use(requireAuth);
const workflows = z.enum(["storyboard", "voiceover", "multi_model", "continuity", "relight", "partner", "billboard"]);

router.get("/models", async (_req, res) => {
  const rows = await db.select().from(providerModels).where(eq(providerModels.enabled, 1));
  return sendData(res, rows);
});

router.post("/shot-design-runs", validateBody(z.object({
  projectId: z.uuid(), workflow: workflows, prompt: z.string().trim().min(1).max(20_000),
  settings: z.record(z.string(), z.unknown()).default({}), referenceAssetIds: z.array(z.uuid()).max(50).default([]),
  providerKey: z.string().min(1).max(50), modelKey: z.string().min(1).max(120), idempotencyKey: z.string().min(12).max(200),
})), async (req, res) => {
  const project = await requireProjectRole(req.auth!.userId, req.body.projectId, "editor");
  const [existing] = await db.select().from(generationJobs).where(and(eq(generationJobs.workspaceId, project.workspaceId), eq(generationJobs.idempotencyKey, req.body.idempotencyKey))).limit(1);
  if (existing) return sendData(res, { run: null, job: existing }, 200, { idempotentReplay: true });
  const [model] = await db.select().from(providerModels).where(and(eq(providerModels.providerKey, req.body.providerKey), eq(providerModels.modelKey, req.body.modelKey), eq(providerModels.enabled, 1))).limit(1);
  if (!model) throw new AppError(422, "MODEL_UNAVAILABLE", "This model is not configured or enabled.");
  const result = await db.transaction(async (tx) => {
    const [run] = await tx.insert(shotDesignRuns).values({ projectId: req.body.projectId, workflow: req.body.workflow, prompt: req.body.prompt, settings: req.body.settings, referenceAssetIds: req.body.referenceAssetIds, status: "queued", createdBy: req.auth!.userId }).returning();
    if (!run) throw new Error("Run insert failed");
    const [job] = await tx.insert(generationJobs).values({ workspaceId: project.workspaceId, projectId: req.body.projectId, runId: run.id, createdBy: req.auth!.userId, workflow: req.body.workflow, providerKey: req.body.providerKey, modelKey: req.body.modelKey, idempotencyKey: req.body.idempotencyKey, request: req.body }).returning();
    if (!job) throw new Error("Generation job insert failed");
    return { run, job };
  });
  const boss = await getBoss();
  await boss.send("generation", { generationJobId: result.job.id }, { id: result.job.id, retryLimit: 3, retryDelay: 30 });
  return sendData(res, result, 202);
});

router.get("/generation-jobs/:jobId", async (req, res) => {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, req.params.jobId as string)).limit(1);
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Generation job not found.");
  await requireProjectRole(req.auth!.userId, job.projectId ?? "", "viewer");
  const outputs = await db.select().from(generationOutputs).where(eq(generationOutputs.jobId, job.id));
  return sendData(res, { ...job, outputs });
});

router.post("/generation-jobs/:jobId/promote-to-scene", validateBody(z.object({
  sceneId: z.uuid(),
  outputId: z.uuid(),
  name: z.string().trim().min(1).max(200).optional(),
})), async (req, res) => {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, req.params.jobId as string)).limit(1);
  if (!job || !job.projectId) throw new AppError(404, "JOB_NOT_FOUND", "Generation job not found.");
  const projectId = job.projectId;
  const project = await requireProjectRole(req.auth!.userId, projectId, "editor");
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, req.body.sceneId)).limit(1);
  if (!scene || scene.projectId !== projectId) throw new AppError(404, "SCENE_NOT_FOUND", "Scene not found.");
  const [output] = await db.select().from(generationOutputs).where(and(eq(generationOutputs.id, req.body.outputId), eq(generationOutputs.jobId, job.id))).limit(1);
  if (!output?.uri) throw new AppError(422, "OUTPUT_UNAVAILABLE", "This generated output cannot be promoted.");
  if (!["image", "video", "audio"].includes(output.kind)) throw new AppError(422, "OUTPUT_KIND_UNSUPPORTED", "This output type cannot be stored as scene media.");

  const remote = await fetch(output.uri);
  if (!remote.ok) throw new AppError(502, "OUTPUT_FETCH_FAILED", "Could not download the generated output.");
  const mimeType = remote.headers.get("content-type")?.split(";")[0] ?? (output.kind === "video" ? "video/mp4" : output.kind === "audio" ? "audio/mpeg" : "image/png");
  const bytes = Buffer.from(await remote.arrayBuffer());
  const storagePath = `${project.workspaceId}/${projectId}/generated/${job.id}-${output.id}.${extensionForMime(mimeType)}`;
  await uploadToStorage(storagePath, bytes, mimeType);

  const result = await db.transaction(async (tx) => {
    const [asset] = await tx.insert(assets).values({
      workspaceId: project.workspaceId,
      projectId,
      name: req.body.name ?? `${job.workflow} output`,
      kind: output.kind as "image" | "video" | "audio",
      createdBy: req.auth!.userId,
    }).returning();
    if (!asset) throw new Error("Asset insert failed");
    const [assetVersion] = await tx.insert(assetVersions).values({
      assetId: asset.id,
      storagePath,
      mimeType,
      byteSize: bytes.byteLength,
      metadata: { generationJobId: job.id, generationOutputId: output.id },
      prompt: typeof job.request.prompt === "string" ? job.request.prompt : "",
      createdBy: req.auth!.userId,
    }).returning();
    if (!assetVersion) throw new Error("Asset version insert failed");
    await tx.update(assets).set({ currentVersionId: assetVersion.id }).where(eq(assets.id, asset.id));
    await tx.update(generationOutputs).set({ assetId: asset.id }).where(eq(generationOutputs.id, output.id));
    const [version] = await tx.insert(sceneVersions).values({
      sceneId: scene.id,
      parentVersionId: scene.currentVersionId,
      kind: output.kind as "image" | "video" | "audio",
      prompt: typeof job.request.prompt === "string" ? job.request.prompt : "",
      settings: job.request.settings && typeof job.request.settings === "object" ? job.request.settings as Record<string, unknown> : {},
      outputAssetIds: [asset.id],
      status: "ready",
      createdBy: req.auth!.userId,
    }).returning();
    if (!version) throw new Error("Scene version insert failed");
    await tx.update(scenes).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
    await tx.update(projects).set({ revision: sql`${projects.revision} + 1`, updatedAt: new Date() }).where(eq(projects.id, projectId));
    return { asset, assetVersion, version };
  });

  const [presented] = await presentScenes([{ ...scene, currentVersionId: result.version.id, updatedAt: new Date() }]);
  req.app.get("io")?.to(`project:${projectId}`).emit("version:created", { sceneId: scene.id, versionId: result.version.id });
  return sendData(res, { ...result, scene: presented, playbackUrl: await createPlaybackUrl(storagePath) }, 201);
});

router.post("/generation-jobs/:jobId/cancel", async (req, res) => {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, req.params.jobId as string)).limit(1);
  if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Generation job not found.");
  if (job.projectId) await requireProjectRole(req.auth!.userId, job.projectId, "editor");
  const adapter = (await import("../providers/registry.js")).getProvider(job.providerKey);
  if (job.providerRequestId && adapter?.cancel) await adapter.cancel(job.providerRequestId, job.request).catch(() => undefined);
  await db.update(generationJobs).set({ status: "canceled", updatedAt: new Date(), completedAt: new Date() }).where(eq(generationJobs.id, job.id));
  if (job.runId) await db.update(shotDesignRuns).set({ status: "canceled", updatedAt: new Date() }).where(eq(shotDesignRuns.id, job.runId));
  return sendData(res, { canceled: true });
});

export const generationRouter = router;
