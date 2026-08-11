import { describe, expect, it } from "vitest";

import { assertQualityImagePaths, qualityImageBasePath } from "./quality-checks.paths.js";

describe("quality image paths", () => {
  it("scopes an image beneath seller, order, check, and image identities", () => {
    expect(qualityImageBasePath("seller", "order", "check", "image")).toBe(
      "seller/order/check/image",
    );
  });

  it("accepts only the exact original and thumbnail paths", () => {
    expect(() =>
      { assertQualityImagePaths(
        "seller/order/check/image",
        "seller/order/check/image/original.jpg",
        "seller/order/check/image/thumbnail.jpg",
      ); },
    ).not.toThrow();
    expect(() =>
      { assertQualityImagePaths(
        "seller/order/check/image",
        "seller/another-order/check/image/original.jpg",
        "seller/order/check/image/thumbnail.jpg",
      ); },
    ).toThrow("do not belong");
  });
});
