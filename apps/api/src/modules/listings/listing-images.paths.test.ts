import { describe, expect, it } from "vitest";

import { assertListingImagePaths } from "./listing-images.paths.js";

describe("assertListingImagePaths", () => {
  const prefix = "seller-a/listing-a/image-a/";

  it("accepts both authorized image variants", () => {
    expect(() => {
      assertListingImagePaths(
        prefix,
        `${prefix}original-unique.jpg`,
        `${prefix}thumbnail-unique.jpg`,
      );
    }).not.toThrow();
  });

  it("rejects a path forged for another seller", () => {
    expect(() => {
      assertListingImagePaths(
        prefix,
        "seller-b/listing-a/image-a/original.jpg",
        `${prefix}thumbnail.jpg`,
      );
    }).toThrow("do not belong");
  });
});
