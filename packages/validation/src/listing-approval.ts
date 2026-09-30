import { z } from "zod";
import { operationMetadataShape } from "./admin-mutation.js";

export const reviewListingSchema = z.object({
  ...operationMetadataShape,
  reviewNote: z.string().trim().max(1000).optional(),
});

export const requestChangesSchema = z.object({
  ...operationMetadataShape,
  reviewNote: z.string().trim().min(3).max(1000),
});

export const priceRequestParamsSchema = z.object({ requestId: z.uuid() });

export const reviewPriceSchema = z.object({
  ...operationMetadataShape,
  reviewNote: z.string().trim().max(1000).optional(),
});

export const rejectPriceSchema = z.object({
  ...operationMetadataShape,
  reviewNote: z.string().trim().min(3).max(1000),
});
