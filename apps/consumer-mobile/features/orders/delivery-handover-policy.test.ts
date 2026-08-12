import { describe, expect, it } from "vitest";

import { canGenerateDeliveryPin, canViewDeliveryEvidence } from "./delivery-handover-policy";

describe("consumer delivery handover", () => {
  it("shows the PIN only during the active assigned delivery window", () => {
    expect(canGenerateDeliveryPin("unassigned")).toBe(false);
    expect(canGenerateDeliveryPin("assigned")).toBe(true);
    expect(canGenerateDeliveryPin("arrived_at_customer")).toBe(true);
    expect(canGenerateDeliveryPin("delivered")).toBe(false);
  });

  it("reveals private signed evidence only after completion", () => {
    expect(canViewDeliveryEvidence("arrived_at_customer")).toBe(false);
    expect(canViewDeliveryEvidence("delivered")).toBe(true);
  });
});
