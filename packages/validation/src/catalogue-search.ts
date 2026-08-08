import { listingAvailabilities } from "@sokoni-digital/domain";
import { z } from "zod";

const optionalQueryBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const catalogueQuerySchema = z.object({
  marketId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  search: z.string().trim().min(1).max(80).optional(),
  availability: z.enum(listingAvailabilities).optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["latest", "price_asc", "price_desc"]).default("latest"),
  reducedData: optionalQueryBoolean.default(false),
});

export const catalogueHomeQuerySchema = z.object({
  marketId: z.uuid().optional(),
  reducedData: optionalQueryBoolean.default(false),
});

export const catalogueListingParamsSchema = z.object({
  listingId: z.uuid(),
});
