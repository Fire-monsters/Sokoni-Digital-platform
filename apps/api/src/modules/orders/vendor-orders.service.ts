import type {
  VendorOrderPage,
  VendorOrderTransitionResult,
  VendorOrderTransitionTarget,
} from "@sokoni-digital/domain";
import type { VendorOrderListQuery } from "@sokoni-digital/validation/vendor-order";

import { decodeVendorOrderCursor, encodeVendorOrderCursor } from "./vendor-orders.cursor.js";
import type { VendorOrderRepository } from "./vendor-orders.types.js";

export class VendorOrdersService {
  constructor(private readonly repository: VendorOrderRepository) {}

  async list(userId: string, query: VendorOrderListQuery): Promise<VendorOrderPage> {
    const result = await this.repository.list(userId, {
      limit: query.limit,
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.cursor ? { cursor: decodeVendorOrderCursor(query.cursor) } : {}),
    });
    const last = result.items.at(-1);
    return {
      items: result.items,
      nextCursor:
        result.hasMore && last
          ? encodeVendorOrderCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  get(userId: string, orderId: string) {
    return this.repository.get(userId, orderId);
  }

  transition(
    userId: string,
    orderId: string,
    toStatus: VendorOrderTransitionTarget,
    expectedVersion: number,
    operationId: string,
  ): Promise<VendorOrderTransitionResult> {
    return this.repository.transition(userId, orderId, toStatus, expectedVersion, operationId);
  }
}
