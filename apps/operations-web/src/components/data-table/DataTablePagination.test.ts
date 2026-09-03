import { describe, expect, it } from "vitest";
import { pageCount } from "./pagination";
describe("pageCount", () => {
  it("rounds partial pages up", () =>
    expect(pageCount({ page: 1, pageSize: 25, totalItems: 26 })).toBe(2));
  it("keeps empty results on one stable page", () =>
    expect(pageCount({ page: 1, pageSize: 25, totalItems: 0 })).toBe(1));
});
