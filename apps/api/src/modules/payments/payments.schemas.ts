import { z } from "zod";
import { operationMetadataShape } from "@sokoni-digital/validation/admin-mutation";
import {
  marketPickupCollectionMethods,
  paymentInvestigationReasons,
  refundRequestReasons,
} from "@sokoni-digital/domain";

const e164Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Use an E.164 phone number.");

export const paymentCheckoutParamsSchema = z.object({ checkoutId: z.uuid() });
export const paymentParamsSchema = z.object({ paymentAttemptId: z.uuid() });
export const reconcilePaymentSchema = z.object(operationMetadataShape).strict();
export const reconcileBatchSchema = reconcilePaymentSchema.extend({ scope: z.literal("pending") });
export const flagPaymentSchema = reconcilePaymentSchema.extend({
  reasonCode: z.enum(paymentInvestigationReasons),
});
export const requestRefundSchema = reconcilePaymentSchema.extend({
  reasonCode: z.enum(refundRequestReasons),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const pesapalInitiationSchema = z
  .object({
    provider: z.literal("pesapal"),
    payerPhone: e164Phone.optional(),
    payerEmail: z.email().optional(),
    payerFirstName: z.string().trim().min(1).max(80).optional(),
    payerLastName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.payerPhone !== undefined || value.payerEmail !== undefined, {
    message: "A payer phone number or email address is required.",
    path: ["payerPhone"],
  });

export const initiatePaymentSchema = z.union([
  pesapalInitiationSchema,
  z.object({ provider: z.literal("market_pickup") }).strict(),
]);

export const marketPickupPaymentSchema = z
  .object({
    amountReceived: z.number().int().positive(),
    currency: z.literal("UGX"),
    paymentMethod: z.enum(marketPickupCollectionMethods),
    pickupCode: z.string().regex(/^[0-9]{6}$/, "Pickup code must contain six digits."),
    operationId: z.uuid(),
  })
  .strict();

export const pesapalNotificationSchema = z.object({
  OrderTrackingId: z.string().min(1),
  OrderMerchantReference: z.string().min(1),
  OrderNotificationType: z.literal("IPNCHANGE"),
});

export const pesapalReturnSchema = z.object({
  OrderTrackingId: z.string().min(1),
  OrderMerchantReference: z.string().min(1),
  OrderNotificationType: z.literal("CALLBACKURL"),
});

export const pesapalCancellationSchema = z.object({
  merchantReference: z.string().min(1),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type MarketPickupPaymentInput = z.infer<typeof marketPickupPaymentSchema>;
export type PesapalNotificationInput = z.infer<typeof pesapalNotificationSchema>;
