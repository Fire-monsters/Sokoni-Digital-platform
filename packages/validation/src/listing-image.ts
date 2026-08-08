import { z } from "zod";

const imageMetadataSchema = z.object({
  path: z.string().min(1).max(500),
  mimeType: z.enum(["image/jpeg", "image/webp"]),
  byteSize: z.number().int().positive().max(500_000),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
});

export const uploadIntentSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/webp"]),
  byteSize: z.number().int().positive().max(500_000),
  width: z.number().int().positive().max(1280),
  height: z.number().int().positive().max(1280),
});

export const imageParamsSchema = z.object({
  listingId: z.uuid(),
  imageId: z.uuid(),
});

export const completeUploadSchema = z.object({
  original: imageMetadataSchema,
  thumbnail: imageMetadataSchema.extend({
    byteSize: z.number().int().positive().max(75_000),
    width: z.number().int().positive().max(320),
    height: z.number().int().positive().max(320),
  }),
  blurHash: z.string().max(200).nullable().default(null),
});
