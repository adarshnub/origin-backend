import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { assets, assetVersions, scenes, sceneVersions } from "../db/schema/index.js";
import { createPlaybackUrl } from "./storage-service.js";

type SceneRecord = typeof scenes.$inferSelect;
type SceneVersionRecord = typeof sceneVersions.$inferSelect;
type AssetRecord = typeof assets.$inferSelect;
type AssetVersionRecord = typeof assetVersions.$inferSelect;

async function safePlaybackUrl(path: string) {
  try {
    return await createPlaybackUrl(path);
  } catch {
    return null;
  }
}

export async function presentScenes(records: SceneRecord[]) {
  const currentVersionIds = records.flatMap((scene) => scene.currentVersionId ? [scene.currentVersionId] : []);
  const versions = currentVersionIds.length
    ? await db.select().from(sceneVersions).where(inArray(sceneVersions.id, currentVersionIds))
    : [];
  const versionById = new Map<string, SceneVersionRecord>(versions.map((version) => [version.id, version]));
  const outputAssetIds = [...new Set(versions.flatMap((version) => version.outputAssetIds))];
  const assetRows = outputAssetIds.length
    ? await db.select().from(assets).where(inArray(assets.id, outputAssetIds))
    : [];
  const assetById = new Map<string, AssetRecord>(assetRows.map((asset) => [asset.id, asset]));
  const assetVersionIds = assetRows.flatMap((asset) => asset.currentVersionId ? [asset.currentVersionId] : []);
  const assetVersionRows = assetVersionIds.length
    ? await db.select().from(assetVersions).where(inArray(assetVersions.id, assetVersionIds))
    : [];
  const assetVersionById = new Map<string, AssetVersionRecord>(assetVersionRows.map((version) => [version.id, version]));

  return Promise.all(records.map(async (scene) => {
    const currentVersion = scene.currentVersionId ? versionById.get(scene.currentVersionId) ?? null : null;
    const firstAssetId = currentVersion?.outputAssetIds[0];
    const asset = firstAssetId ? assetById.get(firstAssetId) : undefined;
    const assetVersion = asset?.currentVersionId ? assetVersionById.get(asset.currentVersionId) : undefined;
    const playbackUrl = assetVersion ? await safePlaybackUrl(assetVersion.storagePath) : null;

    return {
      ...scene,
      currentVersion,
      playback: asset && assetVersion ? {
        assetId: asset.id,
        assetVersionId: assetVersion.id,
        kind: asset.kind,
        mimeType: assetVersion.mimeType,
        storagePath: assetVersion.storagePath,
        url: playbackUrl,
      } : null,
    };
  }));
}
