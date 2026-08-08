import { listingAvailabilities } from "@sokoni-digital/domain";
import { z } from "zod";

export const listingIdParamsSchema = z.object({ listingId: z.uuid() });

export const createListingSchema = z.object({
  catalogProductId: z.uuid(),
  packageQuantity: z.number().positive().max(100000),
  packageUnit: z.string().trim().min(1).max(30),
  description: z.string().trim().max(1000).optional(),
  availability: z.enum(listingAvailabilities).default("available"),
  proposedPriceUgx: z.number().int().positive().max(100_000_000),
});

export const updateListingSchema = createListingSchema
  .omit({ proposedPriceUgx: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const createPriceRequestSchema = z.object({
  proposedPriceUgx: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().max(500).optional(),
});

export const changeAvailabilitySchema = z.object({
  availability: z.enum(listingAvailabilities),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});
