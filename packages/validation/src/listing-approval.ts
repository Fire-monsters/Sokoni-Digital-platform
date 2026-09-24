import { z } from "zod";

export const reviewListingSchema = z.object({
  reviewNote: z.string().trim().max(1000).optional(),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const requestChangesSchema = z.object({
  reviewNote: z.string().trim().min(3).max(1000),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const priceRequestParamsSchema = z.object({ requestId: z.uuid() });

export const reviewPriceSchema = z.object({
  reviewNote: z.string().trim().max(1000).optional(),
  operationId: z.uuid(),
});

export const rejectPriceSchema = z.object({
  reviewNote: z.string().trim().min(3).max(1000),
  operationId: z.uuid(),
});
