import type { DeliveryStatus } from "@sokoni-digital/domain";

const pinStatuses: readonly DeliveryStatus[] = [
  "assigned",
  "arrived_at_market",
  "picked_up",
  "in_transit",
  "arrived_at_customer",
];

export function canGenerateDeliveryPin(status: DeliveryStatus): boolean {
  return pinStatuses.includes(status);
}

export function canViewDeliveryEvidence(status: DeliveryStatus): boolean {
  return status === "delivered";
}
