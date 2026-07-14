import { StorageClient } from "@supabase/storage-js";
import { env } from "../config/env.js";
import { AppError } from "../lib/api.js";

export const allowedUploadMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
  "text/plain",
]);

export function storageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Storage is not configured.");
  }

  return new StorageClient(`${env.SUPABASE_URL}/storage/v1`, {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  });
}

export async function createPlaybackUrl(path: string, expiresInSeconds = 60 * 60) {
  const { data } = await storageClient().from(env.SUPABASE_ASSETS_BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

export async function uploadToStorage(path: string, body: Buffer, contentType: string) {
  const { error } = await storageClient().from(env.SUPABASE_ASSETS_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new AppError(502, "STORAGE_IMPORT_FAILED", "Could not store the media in Supabase.");
}

export function extensionForMime(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "video/mp4": return "mp4";
    case "video/quicktime": return "mov";
    case "audio/mpeg": return "mp3";
    case "audio/wav": return "wav";
    case "application/pdf": return "pdf";
    case "text/plain": return "txt";
    default: return "bin";
  }
}
