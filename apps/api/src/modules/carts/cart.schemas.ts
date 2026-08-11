import { z } from "zod";

const uuid = z.uuid();

export const guestCartSchema = z.object({ marketId: uuid });
export const currentCartQuerySchema = z.object({ marketId: uuid });
export const addCartItemSchema = z.object({
  cartId: uuid,
  listingId: uuid,
  quantity: z.number().int().positive(),
  operationId: uuid,
});
export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
  expectedCartVersion: z.number().int().positive(),
  operationId: uuid,
});
export const cartItemParamsSchema = z.object({ itemId: uuid });
export const mergeCartSchema = z.object({ guestCartId: uuid });
export const cartIdSchema = z.object({ cartId: uuid });
