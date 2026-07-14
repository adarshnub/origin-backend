import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { assets, assetVersions } from "../db/schema/index.js";
import { AppError, sendData } from "../lib/api.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { requireProjectRole, requireWorkspaceRole } from "../services/access-service.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const workspaceId = z.uuid().parse(req.query.workspaceId);
  const projectId = typeof req.query.projectId === "string" ? z.uuid().parse(req.query.projectId) : undefined;
  if (projectId) await requireProjectRole(req.auth!.userId, projectId, "viewer");
  else await requireWorkspaceRole(req.auth!.userId, workspaceId, "viewer");
  const rows = await db.select().from(assets).where(and(
    eq(assets.workspaceId, workspaceId),
    projectId ? eq(assets.projectId, projectId) : undefined,
    isNull(assets.deletedAt),
  )).orderBy(desc(assets.createdAt)).limit(200);
  return sendData(res, rows, 200, { total: rows.length });
});

router.get("/:assetId/versions", async (req, res) => {
  const assetId = req.params.assetId as string;
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), isNull(assets.deletedAt))).limit(1);
  if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  await requireWorkspaceRole(req.auth!.userId, asset.workspaceId, "viewer");
  const versions = await db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(desc(assetVersions.createdAt));
  return sendData(res, versions);
});

router.post("/:assetId/versions", validateBody(z.object({
  storagePath: z.string().min(3).max(500), mimeType: z.string().min(3).max(100), byteSize: z.number().int().positive(),
  prompt: z.string().max(20_000).default(""), metadata: z.record(z.string(), z.unknown()).default({}), parentVersionId: z.uuid().nullable().optional(),
})), async (req, res) => {
  const assetId = req.params.assetId as string;
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), isNull(assets.deletedAt))).limit(1);
  if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  await requireWorkspaceRole(req.auth!.userId, asset.workspaceId, "editor");
  if (!req.body.storagePath.startsWith(`${asset.workspaceId}/`)) throw new AppError(422, "UPLOAD_PATH_INVALID", "The storage path is outside this workspace.");
  const [version] = await db.insert(assetVersions).values({ ...req.body, parentVersionId: req.body.parentVersionId ?? asset.currentVersionId, assetId, createdBy: req.auth!.userId }).returning();
  if (!version) throw new Error("Asset version insert failed");
  await db.update(assets).set({ currentVersionId: version.id }).where(eq(assets.id, assetId));
  return sendData(res, version, 201);
});

router.delete("/:assetId", async (req, res) => {
  const assetId = req.params.assetId as string;
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  await requireWorkspaceRole(req.auth!.userId, asset.workspaceId, "editor");
  await db.update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, asset.id));
  return sendData(res, { deleted: true });
});

export const assetsRouter = router;
