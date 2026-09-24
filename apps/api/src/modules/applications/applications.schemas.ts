import { z } from "zod";

export const applicationParams = z.object({ applicationId: z.uuid() });
export const applicationType = z.enum(["vendor", "rider"]);
export const reviewInput = z
  .object({
    operationId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000).optional(),
    internalNotes: z.string().trim().min(3).max(2000).optional(),
    issues: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/))
      .max(20)
      .optional(),
  })
  .strict();
export const reasonInput = reviewInput.extend({ reason: z.string().trim().min(3).max(1000) });
export const noteInput = reviewInput.extend({ internalNotes: z.string().trim().min(3).max(2000) });
const text = z.string().trim().min(1).max(200);
const personal = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    nationalIdNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{8,20}$/),
  })
  .strict();
const verification = { hasAcceptedPlatformTerms: z.boolean() };
export const vendorPatch = z
  .object({
    personalDetails: personal.optional(),
    stallDetails: z
      .object({
        businessName: text,
        stallNumber: text,
        marketIdentificationNumber: text,
        marketId: z.uuid(),
        productCategories: z.array(text).min(1).max(30),
      })
      .strict()
      .optional(),
    verification: z
      .object({
        ...verification,
        hasMarketLeadershipApproval: z.boolean(),
        hasAcceptedCommissionTerms: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Supply at least one section.");
export const riderPatch = z
  .object({
    personalDetails: personal.optional(),
    motorcycleDetails: z
      .object({ motorcycleNumberPlate: text, vehicleType: text, primaryOperatingArea: text })
      .strict()
      .optional(),
    associationAndNextOfKin: z
      .object({
        riderAssociation: text,
        associationIdentifier: text,
        nextOfKinName: text,
        nextOfKinPhone: z.string().regex(/^\+256\d{9}$/),
        nextOfKinRelationship: text,
      })
      .strict()
      .optional(),
    verification: z
      .object({
        ...verification,
        hasAssociationConfirmation: z.boolean(),
        hasAcceptedSafetyTerms: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Supply at least one section.");
export const submitInput = z.object({ role: applicationType, idempotencyKey: z.uuid() }).strict();
export const uploadInput = z
  .object({
    applicationType,
    documentType: z.enum([
      "national_id",
      "stall_photo",
      "market_confirmation",
      "motorcycle_photo",
      "association_proof",
    ]),
    fileName: z.string().min(1).max(200),
    contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    byteSize: z.number().int().positive().max(5000000),
  })
  .strict();
export const completeInput = z
  .object({
    documentId: z.uuid(),
    storagePath: z.string().optional(),
    checksum: z.string().optional(),
  })
  .strict();
