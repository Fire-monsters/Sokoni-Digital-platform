import { Router } from "express";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { resolveCartOwner, resolveGuestOwner } from "./cart-owner.js";
import { CartRepository } from "./cart.repository.js";
import {
  addCartItemSchema,
  cartIdSchema,
  cartItemParamsSchema,
  currentCartQuerySchema,
  guestCartSchema,
  mergeCartSchema,
  updateCartItemSchema,
} from "./cart.schemas.js";

export function createCartRouter(repository = new CartRepository()): Router {
  const router = Router();

  router.post("/guest", async (request, response, next) => {
    const parsed = guestCartSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        201,
        await repository.getOrCreate(resolveGuestOwner(request), parsed.data.marketId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/current", async (request, response, next) => {
    const parsed = currentCartQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.getCurrent(await resolveCartOwner(request), parsed.data.marketId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/merge", async (request, response, next) => {
    const parsed = mergeCartSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      const authenticated = await resolveCartOwner(request);
      if (!authenticated.consumerId) throw new Error("Authentication is required to merge a cart.");
      sendSuccess(
        request,
        response,
        200,
        await repository.merge(
          authenticated.consumerId,
          resolveGuestOwner(request),
          parsed.data.guestCartId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/current/items", async (request, response, next) => {
    const parsed = addCartItemSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.setQuantity(
          await resolveCartOwner(request),
          parsed.data.cartId,
          parsed.data.listingId,
          parsed.data.quantity,
          undefined,
          parsed.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.patch("/current/items/:itemId", async (request, response, next) => {
    const params = cartItemParamsSchema.safeParse(request.params);
    const body = updateCartItemSchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      const owner = await resolveCartOwner(request);
      const item = await repository.listingIdForItem(owner, params.data.itemId);
      sendSuccess(
        request,
        response,
        200,
        await repository.setQuantity(
          owner,
          item.cartId,
          item.listingId,
          body.data.quantity,
          body.data.expectedCartVersion,
          body.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.delete("/current/items/:itemId", async (request, response, next) => {
    const parsed = cartItemParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      const owner = await resolveCartOwner(request);
      const item = await repository.listingIdForItem(owner, parsed.data.itemId);
      sendSuccess(
        request,
        response,
        200,
        await repository.setQuantity(owner, item.cartId, item.listingId, 0),
      );
    } catch (error) {
      next(error);
    }
  });

  router.delete("/current/items", async (request, response, next) => {
    const parsed = cartIdSchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.clear(await resolveCartOwner(request), parsed.data.cartId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/current/validate", async (request, response, next) => {
    const parsed = cartIdSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.getById(await resolveCartOwner(request), parsed.data.cartId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/current/summary", async (request, response, next) => {
    const parsed = currentCartQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.getCurrent(await resolveCartOwner(request), parsed.data.marketId),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
