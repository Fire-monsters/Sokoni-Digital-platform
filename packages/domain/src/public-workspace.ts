export type PublicWorkspaceKind = "operations" | "warehouse";

export interface PublicWorkspaceConfig {
  operationsEnabled: boolean;
  warehouseEnabled: boolean;
  operationsActorId: string | null;
  warehouseActorId: string | null;
  warehouseId: string | null;
}

export const OPERATIONS_PUBLIC_ACTIONS = [
  "application.review",
  "catalogue.approve",
  "price.review",
  "delivery.assign",
  "order.investigate",
  "payment.record",
  "refund.request",
] as const;

export type OperationsPublicAction = (typeof OPERATIONS_PUBLIC_ACTIONS)[number];

export const WAREHOUSE_PUBLIC_ACTIONS = [
  "listing.review",
  "offer.create",
  "receipt.create",
  "openingStock.create",
  "stock.adjust",
  "order.confirm",
  "dispatch.create",
  "farmerPayment.record",
] as const;

export type WarehousePublicAction = (typeof WAREHOUSE_PUBLIC_ACTIONS)[number];

export type PublicWorkspaceAction = OperationsPublicAction | WarehousePublicAction;

export type PublicWorkspaceContext =
  | {
      kind: "operations";
      actorId: string;
    }
  | {
      kind: "warehouse";
      actorId: string;
      warehouseId: string;
    };

export function isAllowedPublicWorkspaceAction(
  kind: PublicWorkspaceKind,
  action: string,
): boolean {
  if (kind === "operations") {
    return (OPERATIONS_PUBLIC_ACTIONS as readonly string[]).includes(action);
  }
  if (kind === "warehouse") {
    return (WAREHOUSE_PUBLIC_ACTIONS as readonly string[]).includes(action);
  }
  return false;
}

export interface PublicWorkspaceAuditRecord {
  actorId: string;
  actorType: "public-workspace";
  workspace: PublicWorkspaceKind;
  action: string;
  resourceType: string;
  resourceId: string;
  warehouseId?: string | null;
  correlationId: string;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  timestamp: string;
}
