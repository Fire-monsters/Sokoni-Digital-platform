import type {
  VendorFulfilmentStatus,
  VendorOrderDetails,
  VendorOrderSummary,
  VendorOrderTransitionResult,
  VendorOrderTransitionTarget,
  DeliveryPickupConfirmationResult,
} from "@sokoni-digital/domain";

export interface VendorOrderCursor {
  createdAt: string;
  id: string;
}

export interface VendorOrderListInput {
  statuses?: VendorFulfilmentStatus[] | undefined;
  cursor?: VendorOrderCursor | undefined;
  limit: number;
}

export interface VendorOrderRepository {
  list(
    userId: string,
    input: VendorOrderListInput,
  ): Promise<{ items: VendorOrderSummary[]; hasMore: boolean }>;
  get(userId: string, orderId: string): Promise<VendorOrderDetails>;
  transition(
    userId: string,
    orderId: string,
    toStatus: VendorOrderTransitionTarget,
    expectedVersion: number,
    operationId: string,
  ): Promise<VendorOrderTransitionResult>;
  confirmPickup(
    userId: string,
    orderId: string,
    operationId: string,
  ): Promise<DeliveryPickupConfirmationResult>;
}
