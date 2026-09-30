import { describe, expect, it } from "vitest";

import { controlledMutationSchema } from "./admin-mutation.js";

describe("controlledMutationSchema", () => {
  const operationId = "41000000-0000-4000-8000-000000000001";

  it("normalizes and accepts complete operation metadata", () => {
    expect(
      controlledMutationSchema.parse({
        reason: "  Customer requested cancellation  ",
        expectedVersion: 0,
        operationId,
      }),
    ).toEqual({
      reason: "Customer requested cancellation",
      expectedVersion: 0,
      operationId,
    });
  });

  it.each([
    { reason: "ok", expectedVersion: 0, operationId },
    { reason: "Valid operational reason", expectedVersion: -1, operationId },
    { reason: "Valid operational reason", expectedVersion: 1.5, operationId },
    { reason: "Valid operational reason", expectedVersion: 1, operationId: "retry-1" },
  ])("rejects incomplete or malformed control metadata", (input) => {
    expect(controlledMutationSchema.safeParse(input).success).toBe(false);
  });
});
