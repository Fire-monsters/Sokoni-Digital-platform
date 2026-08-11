import { describe, expect, it } from "vitest";

import { hashCanonicalRequest } from "./request-hash.js";

describe("hashCanonicalRequest", () => {
  it("is stable across object key order without changing array order", () => {
    expect(hashCanonicalRequest({ b: 2, nested: { z: 1, a: [3, 2] }, a: 1 })).toBe(
      hashCanonicalRequest({ a: 1, nested: { a: [3, 2], z: 1 }, b: 2 }),
    );
    expect(hashCanonicalRequest({ values: [1, 2] })).not.toBe(
      hashCanonicalRequest({ values: [2, 1] }),
    );
  });
});
