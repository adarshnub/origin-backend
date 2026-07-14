import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashToken } from "../src/lib/crypto.js";

describe("opaque tokens", () => {
  it("generates high-entropy tokens and stores only a stable hash", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(40);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).toBe(hashToken(first));
  });
});
