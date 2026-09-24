import { describe, expect, it } from "vitest";

import { mapRiderOperationsDatabaseError } from "./delivery.errors.js";

describe("delivery database error mapping", () => {
  it.each([
    ["delivery not found", "Delivery not found."],
    ["delivery issue not found", "Delivery issue not found."],
    ["delivery offer not found", "Delivery offer not found."],
  ])("maps missing resources without exposing database details", (message, expected) => {
    const error = mapRiderOperationsDatabaseError({ code: "P0002", message });
    expect(error).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: expected });
  });

  it("returns a useful conflict when a rider becomes unavailable", () => {
    const error = mapRiderOperationsDatabaseError({
      code: "23514",
      message: "selected rider is not available and approved",
    });
    expect(error).toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      message: "The selected rider is no longer available and eligible.",
    });
  });
});
