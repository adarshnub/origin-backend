import { z } from "zod";

const track = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["video", "audio", "caption", "overlay"]),
  name: z.string().min(1).max(100),
  muted: z.boolean().optional(),
});

const timelineItem = z.object({
  id: z.string().min(1).max(100),
  trackId: z.string().min(1).max(100),
  kind: z.enum(["video", "image", "audio", "text", "caption"]),
  name: z.string().max(200).optional(),
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  sourceStartMs: z.number().int().nonnegative().default(0),
  assetId: z.uuid().optional(),
  sourceUrl: z.url().optional(),
  text: z.string().max(10_000).optional(),
  volume: z.number().min(0).max(2).default(1),
  muted: z.boolean().default(false),
  fps: z.number().positive().max(240).optional(),
  frameCount: z.number().int().positive().max(2_000_000).optional(),
  frameEdits: z.array(z.object({
    id: z.string().min(1).max(100),
    frameIndex: z.number().int().nonnegative(),
    timeMs: z.number().int().nonnegative(),
    operation: z.literal("instruction"),
    prompt: z.string().min(1).max(10_000),
    createdAt: z.iso.datetime(),
  })).max(10_000).optional(),
  transform: z.object({ x: z.number(), y: z.number(), scale: z.number().positive(), rotation: z.number() }).optional(),
  style: z.record(z.string(), z.unknown()).optional(),
  transition: z.object({ kind: z.enum(["none", "fade", "dissolve", "slide"]), durationMs: z.number().int().nonnegative().max(5000) }).optional(),
});

export const timelineDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
  tracks: z.array(track).max(100),
  items: z.array(timelineItem).max(10_000),
  output: z.object({ width: z.number().int().min(320).max(7680), height: z.number().int().min(240).max(4320), fps: z.number().int().min(12).max(120) }),
}).superRefine((document, context) => {
  const trackIds = new Set(document.tracks.map((entry) => entry.id));
  for (const [index, item] of document.items.entries()) {
    if (!trackIds.has(item.trackId)) context.addIssue({ code: "custom", path: ["items", index, "trackId"], message: "Track does not exist" });
    if (item.startMs + item.durationMs > document.durationMs) context.addIssue({ code: "custom", path: ["items", index, "durationMs"], message: "Item extends beyond the timeline" });
  }
});

export type TimelineDocument = z.infer<typeof timelineDocumentSchema>;
