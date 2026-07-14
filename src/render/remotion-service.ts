import { StorageClient } from "@supabase/storage-js";
import { getRenderProgress, renderMediaOnLambda } from "@remotion/lambda-client";
import type { AwsRegion } from "@remotion/lambda-client/regions";
import { env } from "../config/env.js";
import type { TimelineDocumentRecord } from "../db/schema/editing.js";

function requireRenderConfiguration() {
  if (!env.AWS_REGION || !env.REMOTION_FUNCTION_NAME || !env.REMOTION_SERVE_URL) {
    throw new Error("Remotion Lambda is not configured for this environment.");
  }
  return { region: env.AWS_REGION as AwsRegion, functionName: env.REMOTION_FUNCTION_NAME, serveUrl: env.REMOTION_SERVE_URL };
}

export function renderConfigured() {
  return Boolean(env.AWS_REGION && env.REMOTION_FUNCTION_NAME && env.REMOTION_SERVE_URL && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function beginTimelineRender(timeline: TimelineDocumentRecord) {
  const config = requireRenderConfiguration();
  return renderMediaOnLambda({
    ...config,
    composition: "OriginTimeline",
    inputProps: { timeline },
    codec: "h264",
    forceWidth: timeline.output.width,
    forceHeight: timeline.output.height,
    forceFps: timeline.output.fps,
    forceDurationInFrames: Math.ceil(timeline.durationMs / 1000 * timeline.output.fps),
    privacy: "private",
    ...(env.REMOTION_S3_BUCKET ? { forceBucketName: env.REMOTION_S3_BUCKET } : {}),
  });
}

export async function readTimelineRender(renderId: string, bucketName: string) {
  const config = requireRenderConfiguration();
  return getRenderProgress({ region: config.region, functionName: config.functionName, renderId, bucketName });
}

export async function importRenderedMedia(sourceUrl: string, videoProjectId: string, renderJobId: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase Storage is not configured.");
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Rendered media download failed with status ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const storagePath = `renders/${videoProjectId}/${renderJobId}.mp4`;
  const storage = new StorageClient(`${env.SUPABASE_URL}/storage/v1`, { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
  const { error } = await storage.from(env.SUPABASE_ASSETS_BUCKET).upload(storagePath, bytes, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(`Rendered media import failed: ${error.message}`);
  return storagePath;
}
