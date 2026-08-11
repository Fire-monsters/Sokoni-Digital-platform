import { qualityImageCompressionContract } from "@sokoni-digital/domain";
import { z } from "zod";

const qualityImageMetadataSchema = z.object({
  path: z.string().trim().min(1).max(500),
  mimeType: z.literal("image/jpeg"),
  byteSize: z.number().int().positive().max(qualityImageCompressionContract.maxOriginalBytes),
  width: z.number().int().positive().max(qualityImageCompressionContract.longEdge),
  height: z.number().int().positive().max(qualityImageCompressionContract.longEdge),
});

export const qualityImageIntentSchema = qualityImageMetadataSchema
  .omit({ path: true })
  .extend({ operationId: z.uuid() });

export const qualityImageParamsSchema = z.object({
  sellerOrderId: z.uuid(),
  imageId: z.uuid(),
});

export const completeQualityImageSchema = z.object({
  original: qualityImageMetadataSchema,
  thumbnail: qualityImageMetadataSchema.extend({
    byteSize: z.number().int().positive().max(qualityImageCompressionContract.maxThumbnailBytes),
    width: z.number().int().positive().max(qualityImageCompressionContract.thumbnailEdge),
    height: z.number().int().positive().max(qualityImageCompressionContract.thumbnailEdge),
  }),
});

export const completeQualityCheckSchema = z.object({
  checklist: z.object({
    itemsChecked: z.literal(true),
    quantitiesChecked: z.literal(true),
    packagingSecure: z.literal(true),
  }),
  notes: z.string().trim().max(1000).nullable().optional(),
  operationId: z.uuid(),
});

export type QualityImageIntentInput = z.infer<typeof qualityImageIntentSchema>;
export type CompleteQualityImageInput = z.infer<typeof completeQualityImageSchema>;
export type CompleteQualityCheckInput = z.infer<typeof completeQualityCheckSchema>;
