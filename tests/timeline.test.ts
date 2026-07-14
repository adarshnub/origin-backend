import { describe, expect, it } from "vitest";
import { timelineDocumentSchema } from "../src/contracts/timeline.js";

const timeline = {
  schemaVersion: 1,
  durationMs: 10_000,
  tracks: [{ id: "video", kind: "video", name: "Video" }],
  items: [{ id: "clip", trackId: "video", kind: "video", startMs: 0, durationMs: 8_000 }],
  output: { width: 1920, height: 1080, fps: 30 },
};

describe("TimelineDocument", () => {
  it("accepts a valid timeline", () => expect(timelineDocumentSchema.safeParse(timeline).success).toBe(true));
  it("rejects missing tracks and overflowing clips", () => {
    const invalid = { ...timeline, items: [{ ...timeline.items[0], trackId: "missing", durationMs: 11_000 }] };
    expect(timelineDocumentSchema.safeParse(invalid).success).toBe(false);
  });
});
