import { vendorFulfilmentStatuses, vendorOrderTransitionTargets } from "@sokoni-digital/domain";
import { z } from "zod";

export const vendorOrderParamsSchema = z.object({ sellerOrderId: z.uuid() });

export const vendorOrderListQuerySchema = z.object({
  status: z
    .preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((status) => status.trim())
              .filter(Boolean)
          : value,
      z.array(z.enum(vendorFulfilmentStatuses)).min(1).max(vendorFulfilmentStatuses.length),
    )
    .optional(),
  cursor: z.string().trim().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const vendorOrderTransitionSchema = z.object({
  toStatus: z.enum(vendorOrderTransitionTargets),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export type VendorOrderListQuery = z.infer<typeof vendorOrderListQuerySchema>;
export type VendorOrderTransitionInput = z.infer<typeof vendorOrderTransitionSchema>;
