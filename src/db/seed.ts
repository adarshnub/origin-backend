import { db, pool } from "./client.js";
import { providerModels } from "./schema/index.js";

const catalog = [
  { providerKey: "openai", modelKey: "gpt-image-1", displayName: "Origin Image", capabilities: ["image"], allowedRatios: ["1:1", "3:2", "2:3"], allowedDurations: [], configurationSchema: { variations: { type: "integer", minimum: 1, maximum: 4 } } },
  { providerKey: "fal", modelKey: "fal-ai/flux-pro", displayName: "Origin Detail", capabilities: ["image"], allowedRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], allowedDurations: [], configurationSchema: { guidance: { type: "number" } } },
  { providerKey: "luma", modelKey: "ray-2", displayName: "Origin Motion", capabilities: ["video"], allowedRatios: ["16:9", "9:16", "1:1"], allowedDurations: [5, 10], configurationSchema: { loop: { type: "boolean" } } },
  { providerKey: "ark", modelKey: "seedream", displayName: "Origin Partner Image", capabilities: ["image"], allowedRatios: ["1:1", "16:9", "9:16"], allowedDurations: [], configurationSchema: {} },
  { providerKey: "sync", modelKey: "lipsync", displayName: "Origin Lip Sync", capabilities: ["video", "lip_sync"], allowedRatios: [], allowedDurations: [], configurationSchema: {} },
  { providerKey: "elevenlabs", modelKey: "tts", displayName: "Origin Voice", capabilities: ["voice"], allowedRatios: [], allowedDurations: [], configurationSchema: { voiceId: { type: "string" } } },
  { providerKey: "pexels", modelKey: "stock-search", displayName: "Origin Stock Search", capabilities: ["stock_media"], allowedRatios: [], allowedDurations: [], configurationSchema: {} },
];

for (const model of catalog) {
  await db.insert(providerModels).values({ ...model, enabled: 0 }).onConflictDoUpdate({
    target: [providerModels.providerKey, providerModels.modelKey],
    set: { displayName: model.displayName, capabilities: model.capabilities, allowedRatios: model.allowedRatios, allowedDurations: model.allowedDurations, configurationSchema: model.configurationSchema, updatedAt: new Date() },
  });
}
await pool.end();
