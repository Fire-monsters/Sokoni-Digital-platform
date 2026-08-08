import { z } from "zod";

export const reviewListingSchema = z.object({
  reviewNote: z.string().trim().max(1000).optional(),
});

export const requestChangesSchema = z.object({
  reviewNote: z.string().trim().min(3).max(1000),
});

export const priceRequestParamsSchema = z.object({ requestId: z.uuid() });

export const reviewPriceSchema = z.object({
  reviewNote: z.string().trim().max(1000).optional(),
});
