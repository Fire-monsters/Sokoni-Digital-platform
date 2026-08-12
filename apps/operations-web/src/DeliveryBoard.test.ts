import type { DispatcherDelivery } from "@sokoni-digital/domain";
import { describe, expect, it } from "vitest";

import { deliveryBoardColumn } from "./delivery-board-policy";

const delivery = {
  id: "delivery",
  reference: "DL-1",
  status: "unassigned",
  version: 1,
  feeUgx: 5000,
  updatedAt: "2026-08-11T12:00:00Z",
  assignedAt: null,
  marketName: "Kitooro",
  zoneName: "Lunyo",
  destinationSummary: "Lunyo",
  consumerPhoneNumber: "+256700000000",
  transporter: null,
  openIssueCount: 0,
} satisfies DispatcherDelivery;

describe("delivery board columns", () => {
  it("shows waiting and active delivery stages", () => {
    expect(deliveryBoardColumn(delivery)).toBe("waiting");
    expect(deliveryBoardColumn({ ...delivery, status: "offering" })).toBe("offers");
    expect(deliveryBoardColumn({ ...delivery, status: "in_transit" })).toBe("transit");
    expect(deliveryBoardColumn({ ...delivery, status: "delivered" })).toBe("completed");
  });

  it("prioritizes open exceptions over the normal stage", () => {
    expect(deliveryBoardColumn({ ...delivery, status: "in_transit", openIssueCount: 1 })).toBe(
      "problems",
    );
  });
});
