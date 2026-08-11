import { z } from "zod";

const pesapalErrorSchema = z
  .object({
    type: z.string().nullish(),
    code: z.string().nullish(),
    message: z.string().nullish(),
  })
  .nullish();

export const tokenResponseSchema = z.object({
  token: z.string().min(1),
  expiryDate: z.string().min(1),
});

export const submitOrderResponseSchema = z.object({
  order_tracking_id: z.string().min(1),
  merchant_reference: z.string().min(1),
  redirect_url: z.url(),
  error: pesapalErrorSchema,
  status: z.union([z.string(), z.number()]).optional(),
});

export const transactionStatusResponseSchema = z.object({
  payment_method: z.string().nullish(),
  amount: z.coerce.number().nonnegative(),
  created_date: z.string().nullish(),
  confirmation_code: z.string().nullish(),
  payment_status_description: z.string().min(1),
  description: z.string().nullish(),
  message: z.string().nullish(),
  payment_account: z.string().nullish(),
  merchant_reference: z.string().min(1),
  currency: z.string().min(1),
  error: pesapalErrorSchema,
  status: z.union([z.string(), z.number()]).optional(),
});

export const ipnPayloadSchema = z
  .object({
    OrderTrackingId: z.string().min(1),
    OrderMerchantReference: z.string().min(1),
    OrderNotificationType: z.literal("IPNCHANGE"),
  })
  .strict();

export type PesapalIpnPayload = z.infer<typeof ipnPayloadSchema>;
