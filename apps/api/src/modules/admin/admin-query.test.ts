import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ADMIN_DEFAULT_PAGE,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  adminOptionalBoolean,
  adminPageOffset,
  createAdminCollectionQuerySchema,
  createAdminPagination,
  resolveAdminSortColumn,
} from "./admin-query.js";

const schema = createAdminCollectionQuerySchema({
  sortFields: ["createdAt", "total", "status"],
  defaultSortBy: "createdAt",
  filters: {
    marketId: z.uuid().optional(),
    delayedOnly: adminOptionalBoolean,
  },
});

describe("admin collection query contract", () => {
  it("applies the shared defaults", () => {
    expect(schema.parse({})).toEqual({
      page: ADMIN_DEFAULT_PAGE,
      pageSize: ADMIN_DEFAULT_PAGE_SIZE,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("normalizes query string values", () => {
    expect(
      schema.parse({
        page: "2",
        pageSize: "50",
        q: "  ORD-24091  ",
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-02T23:59:59Z",
        delayedOnly: "false",
        sortBy: "total",
        sortOrder: "asc",
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      q: "ORD-24091",
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-02T23:59:59Z"),
      delayedOnly: false,
      sortBy: "total",
      sortOrder: "asc",
    });
  });

  it.each([
    [{ page: "0" }, "page"],
    [{ pageSize: String(ADMIN_MAX_PAGE_SIZE + 1) }, "pageSize"],
    [{ q: "" }, "q"],
    [{ from: "September 1" }, "from"],
    [{ delayedOnly: "1" }, "delayedOnly"],
    [{ sortBy: "drop_table" }, "sortBy"],
    [{ sortOrder: "sideways" }, "sortOrder"],
    [{ unknownFilter: "value" }, ""],
  ])("rejects invalid query input %#", (query, field) => {
    const result = schema.safeParse(query);
    expect(result.success).toBe(false);
    if (!result.success && field) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === field)).toBe(true);
    }
  });

  it("rejects a reversed date range", () => {
    const result = schema.safeParse({
      from: "2026-09-03T00:00:00Z",
      to: "2026-09-02T00:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["from"]);
  });
});

describe("admin pagination and sorting helpers", () => {
  it("builds pagination metadata and database offsets", () => {
    expect(createAdminPagination(2, 25, 51)).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 51,
      totalPages: 3,
    });
    expect(adminPageOffset(2, 25)).toBe(25);
  });

  it("reports zero pages for an empty collection", () => {
    expect(createAdminPagination(1, 25, 0).totalPages).toBe(0);
  });

  it("rejects invalid total counts", () => {
    expect(() => createAdminPagination(1, 25, -1)).toThrow(RangeError);
  });

  it("resolves only typed, endpoint-owned sort mappings", () => {
    const columns = { createdAt: "created_at", total: "total_amount" } as const;
    expect(resolveAdminSortColumn("total", columns)).toBe("total_amount");
  });
});
