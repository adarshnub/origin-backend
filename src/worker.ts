import { eq } from "drizzle-orm";
import { db, pool } from "./db/client.js";
import { generationJobs, generationOutputs, renderJobs, shotDesignRuns, videoProjectVersions } from "./db/schema/index.js";
import type { Job } from "pg-boss";
import { getBoss, stopBoss } from "./queues/jobs.js";
import { getProvider } from "./providers/registry.js";
import { beginTimelineRender, importRenderedMedia, readTimelineRender, renderConfigured } from "./render/remotion-service.js";
import { recordGenerationCost } from "./services/cost-service.js";

const boss = await getBoss();

await boss.work<{ generationJobId: string }>("generation", async (jobs: Job<{ generationJobId: string }>[]) => {
  const job = jobs[0];
  if (!job) return;
  const [record] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.data.generationJobId)).limit(1);
  if (!record || record.status === "canceled") return;
  if (record.status === "succeeded" || record.status === "failed") return;
  if (record.attempts >= 120) {
    await db.update(generationJobs).set({ status: "failed", errorCode: "POLL_LIMIT_EXCEEDED", errorMessage: "Provider processing exceeded the bounded polling window.", completedAt: new Date(), updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
    if (record.runId) await db.update(shotDesignRuns).set({ status: "failed", updatedAt: new Date() }).where(eq(shotDesignRuns.id, record.runId));
    return;
  }
  await db.update(generationJobs).set({ status: "running", progress: 5, attempts: record.attempts + 1, updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
  if (record.runId) await db.update(shotDesignRuns).set({ status: "running", updatedAt: new Date() }).where(eq(shotDesignRuns.id, record.runId));
  const adapter = getProvider(record.providerKey);
  if (!adapter?.isConfigured()) {
    await db.update(generationJobs).set({ status: "failed", errorCode: "PROVIDER_UNAVAILABLE", errorMessage: "Provider credentials are not configured.", completedAt: new Date(), updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
    return;
  }
  try {
    const result = record.providerRequestId
      ? await adapter.poll?.(record.providerRequestId, record.request)
      : await adapter.submit(record.request);
    if (!result) throw new Error("This provider returned an asynchronous job but does not implement status polling.");
    if (result.status === "running") {
      await db.update(generationJobs).set({ providerRequestId: result.providerRequestId, status: "running", progress: Math.min(99, Math.max(5, result.progress ?? 20)), updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
      await boss.send("generation", { generationJobId: record.id }, { id: `${record.id}:poll:${Date.now()}`, startAfter: 10, retryLimit: 3, retryDelay: 30 });
      return;
    }
    await db.transaction(async (tx) => {
      const existing = await tx.select({ id: generationOutputs.id }).from(generationOutputs).where(eq(generationOutputs.jobId, record.id)).limit(1);
      if (!existing.length && result.outputs?.length) {
        await tx.insert(generationOutputs).values(result.outputs.map((output) => ({ jobId: record.id, kind: output.kind, uri: output.uri ?? null, metadata: output.metadata })));
      }
      await tx.update(generationJobs).set({ providerRequestId: result.providerRequestId, status: "succeeded", progress: 100, completedAt: new Date(), updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
      if (record.runId) await tx.update(shotDesignRuns).set({ status: "succeeded", updatedAt: new Date() }).where(eq(shotDesignRuns.id, record.runId));
    });
    const settings = record.request.settings && typeof record.request.settings === "object" && !Array.isArray(record.request.settings) ? record.request.settings as Record<string, unknown> : {};
    await recordGenerationCost({ jobId: record.id, workspaceId: record.workspaceId, projectId: record.projectId, userId: record.createdBy, providerKey: record.providerKey, modelKey: record.modelKey, quantity: Number(settings.variations ?? 1) });
  } catch (error) {
    await db.update(generationJobs).set({ status: "failed", errorCode: "PROVIDER_ERROR", errorMessage: error instanceof Error ? error.message : "Provider request failed", completedAt: new Date(), updatedAt: new Date() }).where(eq(generationJobs.id, record.id));
    if (record.runId) await db.update(shotDesignRuns).set({ status: "failed", updatedAt: new Date() }).where(eq(shotDesignRuns.id, record.runId));
    throw error;
  }
});

await boss.work<{ renderJobId: string }>("render", async (jobs: Job<{ renderJobId: string }>[]) => {
  const job = jobs[0];
  if (!job) return;
  const [record] = await db.select().from(renderJobs).where(eq(renderJobs.id, job.data.renderJobId)).limit(1);
  if (!record || record.status === "canceled") return;
  if (!renderConfigured()) {
    await db.update(renderJobs).set({ status: "failed", errorMessage: "Remotion Lambda or media storage is not configured for this environment.", completedAt: new Date(), updatedAt: new Date() }).where(eq(renderJobs.id, record.id));
    return;
  }
  try {
    if (!record.lambdaRenderId || !record.lambdaBucket) {
      const [version] = await db.select().from(videoProjectVersions).where(eq(videoProjectVersions.id, record.versionId)).limit(1);
      if (!version) throw new Error("The timeline snapshot for this render no longer exists.");
      const started = await beginTimelineRender(version.timeline);
      await db.update(renderJobs).set({ status: "rendering", progress: "0.01", lambdaRenderId: started.renderId, lambdaBucket: started.bucketName, updatedAt: new Date() }).where(eq(renderJobs.id, record.id));
      await boss.send("render", { renderJobId: record.id }, { id: `${record.id}:poll:${Date.now()}`, startAfter: 10, retryLimit: 2 });
      return;
    }
    const progress = await readTimelineRender(record.lambdaRenderId, record.lambdaBucket);
    if (progress.fatalErrorEncountered) throw new Error(progress.errors[0]?.message ?? "The render failed in Lambda.");
    await db.update(renderJobs).set({ progress: String(progress.overallProgress), updatedAt: new Date() }).where(eq(renderJobs.id, record.id));
    if (!progress.done) {
      await boss.send("render", { renderJobId: record.id }, { id: `${record.id}:poll:${Date.now()}`, startAfter: 10, retryLimit: 2 });
      return;
    }
    if (!progress.outputFile) throw new Error("The completed render did not return an output file.");
    const outputStoragePath = await importRenderedMedia(progress.outputFile, record.videoProjectId, record.id);
    await db.update(renderJobs).set({ status: "succeeded", progress: "1", outputStoragePath, completedAt: new Date(), updatedAt: new Date() }).where(eq(renderJobs.id, record.id));
  } catch (error) {
    await db.update(renderJobs).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Render failed", completedAt: new Date(), updatedAt: new Date() }).where(eq(renderJobs.id, record.id));
    throw error;
  }
});

console.info("Origin worker is ready");

async function shutdown() {
  await stopBoss();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
