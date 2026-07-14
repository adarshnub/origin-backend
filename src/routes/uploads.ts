import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { assets, assetVersions } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireProjectRole, requireWorkspaceRole } from "../services/access-service.js";
import { allowedUploadMime, createPlaybackUrl, storageClient } from "../services/storage-service.js";

const router = Router();
router.use(requireAuth);

router.post("/sign", validateBody(z.object({ workspaceId: z.uuid(), projectId: z.uuid().nullable().optional(), filename: z.string().min(1).max(200), mimeType: z.string().max(100), byteSize: z.number().int().positive().max(1024 * 1024 * 1024) })), async (req, res) => {
  await requireWorkspaceRole(req.auth!.userId, req.body.workspaceId, "editor");
  if (!allowedUploadMime.has(req.body.mimeType)) throw new AppError(422, "FILE_TYPE_UNSUPPORTED", "This file type is not supported.");
  const extension = req.body.filename.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const path = `${req.body.workspaceId}/${req.body.projectId ?? "library"}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await storageClient().from(env.SUPABASE_ASSETS_BUCKET).createSignedUploadUrl(path);
  if (error) {
    if (error.message.toLowerCase().includes("resource does not exist")) {
      throw new AppError(503, "STORAGE_BUCKET_MISSING", `Storage bucket "${env.SUPABASE_ASSETS_BUCKET}" does not exist.`);
    }
    console.error("Supabase signed upload failed", { name: error.name, message: error.message, status: error.status });
    throw new AppError(502, "UPLOAD_SIGN_FAILED", "Could not prepare the upload.");
  }
  return sendData(res, { path, token: data.token, signedUrl: data.signedUrl });
});

router.post("/confirm", validateBody(z.object({
  path: z.string().min(1).max(500), byteSize: z.number().int().positive().max(1024 * 1024 * 1024), mimeType: z.string().max(100),
  name: z.string().trim().min(1).max(200), kind: z.enum(["image", "video", "audio", "document"]), projectId: z.uuid().nullable().optional(),
})), async (req, res) => {
  const prefix = req.body.path.split("/")[0];
  if (!prefix) throw new AppError(422, "UPLOAD_PATH_INVALID", "Upload path is invalid.");
  await requireWorkspaceRole(req.auth!.userId, prefix, "editor");
  if (!req.body.path.startsWith(`${prefix}/${req.body.projectId ?? "library"}/`)) throw new AppError(422, "UPLOAD_PATH_INVALID", "Upload path does not match its project.");
  if (req.body.projectId) await requireProjectRole(req.auth!.userId, req.body.projectId, "editor");
  if (!allowedUploadMime.has(req.body.mimeType)) throw new AppError(422, "FILE_TYPE_UNSUPPORTED", "This file type is not supported.");
  const separator = req.body.path.lastIndexOf("/");
  const folder = req.body.path.slice(0, separator);
  const filename = req.body.path.slice(separator + 1);
  const { data: stored, error } = await storageClient().from(env.SUPABASE_ASSETS_BUCKET).list(folder, { search: filename, limit: 10 });
  if (error || !stored.some((object) => object.name === filename)) throw new AppError(422, "UPLOAD_NOT_FOUND", "The uploaded object could not be verified.");
  const result = await db.transaction(async (tx) => {
    const [asset] = await tx.insert(assets).values({ workspaceId: prefix, projectId: req.body.projectId ?? null, name: req.body.name, kind: req.body.kind, createdBy: req.auth!.userId }).returning();
    if (!asset) throw new Error("Asset insert failed");
    const [version] = await tx.insert(assetVersions).values({ assetId: asset.id, storagePath: req.body.path, mimeType: req.body.mimeType, byteSize: req.body.byteSize, createdBy: req.auth!.userId }).returning();
    if (!version) throw new Error("Asset version insert failed");
    await tx.update(assets).set({ currentVersionId: version.id }).where(eq(assets.id, asset.id));
    return { ...asset, currentVersionId: version.id, version };
  });
  return sendData(res, { ...result, playbackUrl: await createPlaybackUrl(req.body.path) }, 201);
});

export const uploadsRouter = router;
