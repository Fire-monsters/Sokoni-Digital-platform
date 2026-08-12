import type { DispatcherDelivery } from "@sokoni-digital/domain";

export type DeliveryBoardColumn =
  "waiting" | "offers" | "assigned" | "market" | "transit" | "problems" | "completed";

export function deliveryBoardColumn(delivery: DispatcherDelivery): DeliveryBoardColumn {
  if (
    delivery.openIssueCount > 0 ||
    ["pickup_failed", "delivery_failed", "customer_unavailable", "issue_reported"].includes(
      delivery.status,
    )
  )
    return "problems";
  if (["delivered", "returned", "assignment_cancelled"].includes(delivery.status))
    return "completed";
  if (delivery.status === "unassigned") return "waiting";
  if (delivery.status === "offering") return "offers";
  if (delivery.status === "assigned") return "assigned";
  if (["arrived_at_market", "picked_up"].includes(delivery.status)) return "market";
  return "transit";
}
