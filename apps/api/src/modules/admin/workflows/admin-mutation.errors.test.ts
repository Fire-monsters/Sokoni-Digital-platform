import { describe, expect, it } from "vitest";

import { AdminMutationError, normalizeAdminMutationError } from "./admin-mutation.errors.js";

describe("normalizeAdminMutationError", () => {
  const operationId = "30000000-0000-4000-8000-000000000001";

  it("standardizes legacy version conflicts", () => {
    const error = normalizeAdminMutationError(
      Object.assign(new Error("Delivery changed; refresh before continuing."), {
        statusCode: 409,
        code: "CONFLICT",
      }),
      operationId,
    );

    expect(error).toMatchObject({
      code: "VERSION_CONFLICT",
      statusCode: 409,
      operationId,
      retryable: false,
    });
  });

  it("standardizes legacy operation-key reuse conflicts", () => {
    const error = normalizeAdminMutationError(
      Object.assign(new Error("Operation key was reused with another command."), {
        statusCode: 409,
        code: "CONFLICT",
      }),
      operationId,
    );

    expect(error).toBeInstanceOf(AdminMutationError);
    expect(error).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409,
      operationId,
      retryable: false,
    });
  });
});
