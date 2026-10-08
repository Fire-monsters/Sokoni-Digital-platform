import { z } from "zod";

export const businessPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .transform((v) => (v.startsWith("0") ? `+256${v.slice(1)}` : v))
  .pipe(
    z.string().regex(/^\+256(?:7[0-9]|3[0-9])[0-9]{7}$/, "Enter a valid Ugandan phone number."),
  );
const password = z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
export const businessRegisterSchema = z
  .object({ phoneNumber: businessPhoneSchema, password })
  .strict();
export const businessLoginSchema = z
  .object({ phoneNumber: businessPhoneSchema, password: z.string().min(1).max(128) })
  .strict();
export const businessOtpSchema = z
  .object({ phoneNumber: businessPhoneSchema, otpCode: z.string().regex(/^\d{6}$/) })
  .strict();
export const businessResendSchema = z.object({ phoneNumber: businessPhoneSchema }).strict();
export const businessRefreshSchema = z
  .object({ refreshToken: z.string().min(1).max(4096) })
  .strict();
export const cropCategorySchema = z
  .enum(["CASH", "FOOD", "cash", "food"])
  .transform((value): "CASH" | "FOOD" => (value === "cash" || value === "CASH" ? "CASH" : "FOOD"));
export const businessMutationSchema = z
  .object({ operationId: z.uuid(), expectedVersion: z.number().int().positive() })
  .strict();
export const createBusinessSchema = z
  .object({
    operationId: z.uuid(),
    kind: z.enum(["farmer", "sme"]),
    name: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(300),
  })
  .strict();
export const patchBusinessSchema = businessMutationSchema
  .extend({
    name: z.string().trim().min(2).max(160).optional(),
    location: z.string().trim().min(2).max(300).optional(),
  })
  .refine((v) => v.name !== undefined || v.location !== undefined, "Supply name or location.");
export const businessPreferencesSchema = businessMutationSchema.extend({
  categories: z
    .array(cropCategorySchema)
    .min(1)
    .max(2)
    .refine((v) => new Set(v).size === v.length, "Duplicate category."),
  productIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length, "Duplicate product."),
});
export const businessReviewSchema = businessMutationSchema.extend({
  status: z.enum(["approved", "rejected", "changes_requested", "suspended"]),
  reason: z.string().trim().min(3).max(1000),
});
export const businessPageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
