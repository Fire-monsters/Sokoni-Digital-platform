import { describe, expect, it } from "vitest";

import { qualityProofImagePolicy } from "./quality-proof-policy";

describe("quality proof weak-network policy", () => {
  it("loads a cached low-priority thumbnail before an explicitly requested full image", () => {
    expect(qualityProofImagePolicy).toMatchObject({
      cachePolicy: "memory-disk",
      thumbnailPriority: "low",
      fullImageLoadsAutomatically: false,
    });
  });
});
