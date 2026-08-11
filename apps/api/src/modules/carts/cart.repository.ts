/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import type { CartAdjustment, CartOwner, CartView } from "./cart.types.js";

type LooseClient = SupabaseClient;

interface DbCart {
  id: string;
  market_id: string;
  status: string;
  currency_code: string;
  version: number;
}

interface DbCartItem {
  id: string;
  listing_id: string;
  quantity: number;
  price_snapshot_ugx: number;
  listing_version: number;
  listings: {
    stock_available: number;
    status: string;
    approved_price_ugx: number | null;
    package_quantity: number;
    package_unit: string;
    catalog_products: { name: string };
    sellers: { id: string; business_name: string; verification_status: string };
  };
}

export class CartNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CART_NOT_FOUND";
}

export class CartConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CART_VERSION_CONFLICT";
}

export class CartValidationError extends Error {
  readonly statusCode = 422;
  readonly code = "CART_ITEM_INVALID";
}

export class CartRepository {
  private readonly db: LooseClient;

  constructor(client: LooseClient = supabase as unknown as SupabaseClient) {
    this.db = client;
  }

  private ownerArgs(owner: CartOwner) {
    return {
      requested_consumer_id: owner.consumerId,
      requested_guest_token_hash: owner.guestTokenHash,
      requested_installation_id: owner.installationId,
    };
  }

  async getOrCreate(owner: CartOwner, marketId: string): Promise<CartView> {
    const { data, error } = await this.db.rpc("get_or_create_cart", {
      requested_market_id: marketId,
      ...this.ownerArgs(owner),
    });
    if (error || typeof data !== "string") throw this.mapError(error);
    return this.getById(owner, data);
  }

  async getCurrent(owner: CartOwner, marketId: string): Promise<CartView> {
    let query = this.db.from("carts").select("id").eq("market_id", marketId).eq("status", "active");
    query = owner.consumerId
      ? query.eq("consumer_id", owner.consumerId)
      : query
          .eq("guest_token_hash", owner.guestTokenHash)
          .eq("installation_id", owner.installationId);
    const { data, error } = await query.maybeSingle();
    if (error) throw this.mapError(error);
    if (!data) throw new CartNotFoundError("No active cart was found.");
    return this.getById(owner, String(data.id));
  }

  async getById(owner: CartOwner, cartId: string): Promise<CartView> {
    let query = this.db
      .from("carts")
      .select("id, market_id, status, currency_code, version")
      .eq("id", cartId)
      .eq("status", "active");
    query = owner.consumerId
      ? query.eq("consumer_id", owner.consumerId)
      : query
          .eq("guest_token_hash", owner.guestTokenHash)
          .eq("installation_id", owner.installationId);
    const { data: cart, error: cartError } = await query.maybeSingle();
    if (cartError) throw this.mapError(cartError);
    if (!cart) throw new CartNotFoundError("No active cart was found.");

    const { data: items, error: itemError } = await this.db
      .from("cart_items")
      .select(
        `
      id, listing_id, quantity, price_snapshot_ugx, listing_version,
      listings!inner(
        stock_available, status, approved_price_ugx, package_quantity, package_unit,
        catalog_products!inner(name),
        sellers!inner(id, business_name, verification_status)
      )
    `,
      )
      .eq("cart_id", cartId)
      .order("created_at")
      .order("id");
    if (itemError) throw this.mapError(itemError);
    return this.toView(cart as DbCart, (items ?? []) as unknown as DbCartItem[]);
  }

  async setQuantity(
    owner: CartOwner,
    cartId: string,
    listingId: string,
    quantity: number,
    expectedVersion?: number,
    operationId?: string,
  ) {
    const { error } = await this.db.rpc("mutate_cart_item", {
      requested_cart_id: cartId,
      requested_listing_id: listingId,
      requested_quantity: quantity,
      expected_cart_version: expectedVersion ?? null,
      requested_operation_id: operationId ?? null,
      ...this.ownerArgs(owner),
    });
    if (error) throw this.mapError(error);
    return this.getById(owner, cartId);
  }

  async listingIdForItem(
    owner: CartOwner,
    itemId: string,
  ): Promise<{ cartId: string; listingId: string }> {
    const { data, error } = await this.db
      .from("cart_items")
      .select(
        "cart_id, listing_id, carts!inner(consumer_id, guest_token_hash, installation_id, status)",
      )
      .eq("id", itemId)
      .eq("carts.status", "active")
      .maybeSingle();
    if (error) throw this.mapError(error);
    if (!data) throw new CartNotFoundError("Cart item was not found.");
    const cart = data.carts as unknown as {
      consumer_id: string | null;
      guest_token_hash: string | null;
      installation_id: string | null;
    };
    const owns = owner.consumerId
      ? cart.consumer_id === owner.consumerId
      : cart.guest_token_hash === owner.guestTokenHash &&
        cart.installation_id === owner.installationId;
    if (!owns) throw new CartNotFoundError("Cart item was not found.");
    return { cartId: String(data.cart_id), listingId: String(data.listing_id) };
  }

  async clear(owner: CartOwner, cartId: string): Promise<CartView> {
    const { error } = await this.db.rpc("clear_cart", {
      requested_cart_id: cartId,
      ...this.ownerArgs(owner),
    });
    if (error) throw this.mapError(error);
    return this.getById(owner, cartId);
  }

  async merge(
    consumerId: string,
    guest: CartOwner,
    guestCartId: string,
  ): Promise<{ cart: CartView; adjustments: CartAdjustment[] }> {
    const { data, error } = await this.db.rpc("merge_guest_cart", {
      requested_guest_cart_id: guestCartId,
      requested_consumer_id: consumerId,
      requested_guest_token_hash: guest.guestTokenHash,
      requested_installation_id: guest.installationId,
    });
    if (error) throw this.mapError(error);
    const result = data as { cartId: string; adjustments: CartAdjustment[] };
    const owner = { consumerId, guestTokenHash: null, installationId: null };
    return { cart: await this.getById(owner, result.cartId), adjustments: result.adjustments };
  }

  private toView(cart: DbCart, items: DbCartItem[]): CartView {
    const mapped = items.map((item) => {
      const listing = item.listings;
      const available =
        listing.status === "active" &&
        listing.sellers.verification_status === "approved" &&
        listing.approved_price_ugx !== null &&
        item.quantity <= listing.stock_available;
      return {
        id: item.id,
        listingId: item.listing_id,
        quantity: item.quantity,
        unitPriceUgx: item.price_snapshot_ugx,
        lineTotalUgx: item.price_snapshot_ugx * item.quantity,
        listingVersion: item.listing_version,
        productName: listing.catalog_products.name,
        packageLabel: `${String(listing.package_quantity)} ${listing.package_unit}`,
        seller: { id: listing.sellers.id, name: listing.sellers.business_name },
        availableStock: listing.stock_available,
        available,
      };
    });
    return {
      id: cart.id,
      marketId: cart.market_id,
      status: cart.status,
      currencyCode: cart.currency_code,
      version: cart.version,
      items: mapped,
      itemCount: mapped.reduce((sum, item) => sum + item.quantity, 0),
      subtotalUgx: mapped.reduce((sum, item) => sum + item.lineTotalUgx, 0),
      valid: mapped.length > 0 && mapped.every((item) => item.available),
    };
  }

  private mapError(error: { code?: string; message?: string } | null): Error {
    if (error?.code === "40001")
      return new CartConflictError("The cart changed; refresh and retry.");
    if (error?.code === "P0002") return new CartNotFoundError("No active cart was found.");
    if (error?.code === "23514" || error?.code === "22023")
      return new CartValidationError(error.message ?? "The cart item is invalid.");
    return new Error(error?.message ?? "The cart operation failed.");
  }
}
