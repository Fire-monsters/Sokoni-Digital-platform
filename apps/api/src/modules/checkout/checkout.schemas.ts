import { z } from "zod";

const scheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("immediate") }),
  z.object({ type: z.literal("scheduled"), requestedFor: z.iso.datetime({ offset: true }) }),
]);

const fulfilmentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delivery"),
    deliveryZoneId: z.uuid(),
    addressId: z.uuid(),
    schedule: scheduleSchema,
  }),
  z.object({
    type: z.literal("market_pickup"),
    marketId: z.uuid(),
    addressId: z.uuid(),
    schedule: scheduleSchema,
  }),
]);

export const createCheckoutSchema = z.object({ cartId: z.uuid(), fulfilment: fulfilmentSchema });
export const checkoutParamsSchema = z.object({ checkoutId: z.uuid() });
export const consumerOrderParamsSchema = z.object({ sellerOrderId: z.uuid() });
export const deliveryZonesQuerySchema = z.object({ marketId: z.uuid() });
export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(50),
  summary: z.string().trim().min(3).max(300),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+256[0-9]{9}$/),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
