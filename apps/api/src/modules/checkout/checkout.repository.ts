/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsumerCheckoutProgress,
  ConsumerOrderProgressStep,
  ConsumerQualityProof,
  VendorFulfilmentStatus,
} from "@sokoni-digital/domain";

import { supabase } from "../../infrastructure/supabase/client.js";
import type { CreateAddressInput, CreateCheckoutInput } from "./checkout.schemas.js";

export class CheckoutNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CHECKOUT_NOT_FOUND";
}
export class CheckoutRejectedError extends Error {
  readonly statusCode = 422;
  readonly code = "CHECKOUT_REJECTED";
}

export class CheckoutRepository {
  constructor(private readonly db: SupabaseClient = supabase as unknown as SupabaseClient) {}

  async create(
    userId: string,
    input: CreateCheckoutInput,
    clientReference: string,
    reservationMinutes = 15,
  ) {
    const schedule = input.fulfilment.schedule;
    const { data, error } = await this.db.rpc("create_checkout_from_cart", {
      p_consumer_id: userId,
      p_cart_id: input.cartId,
      p_fulfilment_type: input.fulfilment.type,
      p_delivery_zone_id:
        input.fulfilment.type === "delivery" ? input.fulfilment.deliveryZoneId : null,
      p_address_id: input.fulfilment.addressId,
      p_market_id: input.fulfilment.type === "market_pickup" ? input.fulfilment.marketId : null,
      p_schedule_type: schedule.type,
      p_requested_for: schedule.type === "scheduled" ? schedule.requestedFor : null,
      p_client_reference: clientReference,
      p_reservation_minutes: reservationMinutes,
    });
    if (error) throw this.mapError(error);
    const created = data as { checkoutId: string; pickupCode: string | null };
    return { ...(await this.get(userId, created.checkoutId)), pickupCode: created.pickupCode };
  }

  async listDeliveryZones(marketId: string) {
    const { data, error } = await this.db
      .from("delivery_zones")
      .select("id, name, delivery_fee_ugx")
      .eq("market_id", marketId)
      .eq("is_active", true)
      .order("delivery_fee_ugx")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((zone) => ({
      id: String(zone.id),
      name: String(zone.name),
      deliveryFeeUgx: Number(zone.delivery_fee_ugx),
    }));
  }

  async listAddresses(userId: string) {
    const { data, error } = await this.db
      .from("consumer_addresses")
      .select("id, label, summary, phone_number")
      .eq("consumer_id", userId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((address) => ({
      id: String(address.id),
      label: String(address.label),
      summary: String(address.summary),
      phoneNumber: String(address.phone_number),
    }));
  }

  async createAddress(userId: string, input: CreateAddressInput) {
    const { data, error } = await this.db
      .from("consumer_addresses")
      .insert({
        consumer_id: userId,
        label: input.label,
        summary: input.summary,
        phone_number: input.phoneNumber,
      })
      .select("id, label, summary, phone_number")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String(data.id),
      label: String(data.label),
      summary: String(data.summary),
      phoneNumber: String(data.phone_number),
    };
  }

  async get(userId: string, checkoutId: string) {
    const { data: checkout, error } = await this.db
      .from("customer_checkouts")
      .select(
        "id, reference, status, currency_code, items_subtotal_ugx, delivery_fee_ugx, service_fee_ugx, total_ugx, reservation_expires_at",
      )
      .eq("id", checkoutId)
      .eq("consumer_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!checkout) throw new CheckoutNotFoundError("Checkout was not found.");

    const { data: orders, error: orderError } = await this.db
      .from("vendor_orders")
      .select(
        "id, reference, seller_id, status, subtotal_ugx, sellers!inner(business_name, markets(name))",
      )
      .eq("checkout_id", checkoutId)
      .order("seller_id");
    if (orderError) throw new Error(orderError.message);
    const orderIds = (orders ?? []).map((order) => String(order.id));
    const { data: items, error: itemError } =
      orderIds.length === 0
        ? { data: [], error: null }
        : await this.db
            .from("vendor_order_items")
            .select(
              "id, vendor_order_id, listing_id, product_name, package_quantity, package_unit, unit_price_ugx, quantity, line_total_ugx, thumbnail_bucket, thumbnail_path",
            )
            .in("vendor_order_id", orderIds)
            .order("created_at");
    if (itemError) throw new Error(itemError.message);
    const { data: fulfilment, error: fulfilmentError } = await this.db
      .from("checkout_fulfilments")
      .select(
        "type, schedule_type, requested_for, delivery_zone_id, delivery_zone_name, address_label, address_summary, pickup_market_id, markets(name)",
      )
      .eq("checkout_id", checkoutId)
      .single();
    if (fulfilmentError) throw new Error(fulfilmentError.message);
    const { data: payment, error: paymentError } = await this.db
      .from("payment_attempts")
      .select(
        "id, provider, payment_method, status, amount_ugx, currency_code, merchant_reference, resolved_at",
      )
      .eq("checkout_id", checkoutId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    const { data: pickupPaymentRecord, error: pickupPaymentError } = payment
      ? await this.db
          .from("market_pickup_payment_records")
          .select("collection_method, recorded_at")
          .eq("payment_attempt_id", payment.id)
          .maybeSingle()
      : { data: null, error: null };
    if (pickupPaymentError) throw new Error(pickupPaymentError.message);

    const checkoutStatus = String(checkout.status);
    const allocationCommitted = ["paid", "confirmed_unpaid"].includes(checkoutStatus);
    const expiresAt = allocationCommitted ? null : String(checkout.reservation_expires_at);
    return {
      id: String(checkout.id),
      reference: String(checkout.reference),
      status: checkoutStatus,
      currency: String(checkout.currency_code),
      sellerGroups: (orders ?? []).map((order) => {
        const seller = order.sellers as unknown as {
          business_name: string;
          markets: { name: string } | null;
        };
        return {
          sellerOrderId: String(order.id),
          sellerOrderReference: String(order.reference),
          status: String(order.status),
          seller: {
            id: String(order.seller_id),
            name: seller.business_name,
            marketName: seller.markets?.name ?? null,
          },
          items: (items ?? [])
            .filter((item) => item.vendor_order_id === order.id)
            .map((item) => ({
              orderItemId: String(item.id),
              listingId: String(item.listing_id),
              productName: String(item.product_name),
              packageLabel: `${String(item.package_quantity)} ${String(item.package_unit)}`,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unit_price_ugx),
              lineTotal: Number(item.line_total_ugx),
              thumbnailUrl:
                item.thumbnail_bucket && item.thumbnail_path
                  ? supabase.storage
                      .from(String(item.thumbnail_bucket))
                      .getPublicUrl(String(item.thumbnail_path)).data.publicUrl
                  : null,
            })),
          subtotal: Number(order.subtotal_ugx),
        };
      }),
      fulfilment: {
        type: String(fulfilment.type),
        deliveryZone: fulfilment.delivery_zone_id
          ? { id: String(fulfilment.delivery_zone_id), name: String(fulfilment.delivery_zone_name) }
          : null,
        address: fulfilment.address_summary
          ? { label: String(fulfilment.address_label), summary: String(fulfilment.address_summary) }
          : null,
        pickupMarket: fulfilment.pickup_market_id
          ? {
              id: String(fulfilment.pickup_market_id),
              name: (fulfilment.markets as unknown as { name: string } | null)?.name ?? null,
            }
          : null,
        pickupCodeRequired: fulfilment.type === "market_pickup",
        schedule: {
          type: String(fulfilment.schedule_type),
          requestedFor: fulfilment.requested_for ? String(fulfilment.requested_for) : null,
        },
      },
      pricing: {
        itemsSubtotal: Number(checkout.items_subtotal_ugx),
        deliveryFee: Number(checkout.delivery_fee_ugx),
        serviceFee: Number(checkout.service_fee_ugx),
        total: Number(checkout.total_ugx),
      },
      reservation: {
        expiresAt,
        status: allocationCommitted
          ? "committed"
          : checkoutStatus === "expired"
            ? "expired"
            : "active",
        remainingSeconds: expiresAt
          ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
          : 0,
      },
      payment: payment
        ? {
            paymentAttemptId: String(payment.id),
            provider: String(payment.provider),
            paymentMethod: payment.payment_method ? String(payment.payment_method) : null,
            status: String(payment.status),
            amount: Number(payment.amount_ugx),
            currency: String(payment.currency_code),
            merchantReference: String(payment.merchant_reference),
            paidAt: payment.resolved_at ? String(payment.resolved_at) : null,
            collectionMethod: pickupPaymentRecord?.collection_method
              ? String(pickupPaymentRecord.collection_method)
              : null,
            collectedAt: pickupPaymentRecord?.recorded_at
              ? String(pickupPaymentRecord.recorded_at)
              : null,
            displayStatus:
              payment.provider === "market_pickup" && payment.status === "pending"
                ? "Pay at pickup"
                : String(payment.status),
          }
        : null,
    };
  }

  async getProgress(userId: string, checkoutId: string): Promise<ConsumerCheckoutProgress> {
    const { data: checkout, error: checkoutError } = await this.db
      .from("customer_checkouts")
      .select("id,reference,status,created_at")
      .eq("id", checkoutId)
      .eq("consumer_id", userId)
      .maybeSingle();
    if (checkoutError) throw new Error(checkoutError.message);
    if (!checkout) throw new CheckoutNotFoundError("Checkout was not found.");

    const { data: orders, error: ordersError } = await this.db
      .from("vendor_orders")
      .select(
        "id,reference,seller_id,status,subtotal_ugx,sellers!inner(business_name,markets(name))",
      )
      .eq("checkout_id", checkoutId)
      .neq("status", "awaiting_payment")
      .neq("status", "expired")
      .order("created_at");
    if (ordersError) throw new Error(ordersError.message);
    const orderIds = (orders ?? []).map((order) => String(order.id));
    const [itemsResult, historyResult, checksResult] = await Promise.all([
      orderIds.length
        ? this.db
            .from("vendor_order_items")
            .select("vendor_order_id,quantity")
            .in("vendor_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? this.db
            .from("vendor_order_status_history")
            .select("vendor_order_id,to_status,created_at")
            .in("vendor_order_id", orderIds)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? this.db
            .from("quality_checks")
            .select("id,vendor_order_id,status")
            .in("vendor_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);
    if (checksResult.error) throw new Error(checksResult.error.message);
    const checkIds = (checksResult.data ?? []).map((check) => String(check.id));
    const imagesResult = checkIds.length
      ? await this.db
          .from("quality_check_images")
          .select("quality_check_id")
          .in("quality_check_id", checkIds)
          .eq("is_packing_proof", true)
          .eq("upload_status", "ready")
      : { data: [], error: null };
    if (imagesResult.error) throw new Error(imagesResult.error.message);

    return {
      checkoutId: String(checkout.id),
      reference: String(checkout.reference),
      status: String(checkout.status),
      sellerOrders: (orders ?? []).map((order) => {
        const seller = order.sellers as unknown as {
          business_name: string;
          markets: { name: string } | null;
        };
        const history = (historyResult.data ?? []).filter(
          (entry) => String(entry.vendor_order_id) === String(order.id),
        );
        const check = (checksResult.data ?? []).find(
          (entry) => String(entry.vendor_order_id) === String(order.id),
        );
        return {
          id: String(order.id),
          reference: String(order.reference),
          seller: {
            id: String(order.seller_id),
            name: seller.business_name,
            marketName: seller.markets?.name ?? null,
          },
          status: String(order.status) as VendorFulfilmentStatus,
          itemCount: (itemsResult.data ?? [])
            .filter((item) => String(item.vendor_order_id) === String(order.id))
            .reduce((sum, item) => sum + Number(item.quantity), 0),
          subtotalUgx: Number(order.subtotal_ugx),
          qualityCheck: {
            status: check
              ? (String(check.status) as "draft" | "completed" | "invalidated")
              : ("not_started" as const),
            hasProof: check
              ? (imagesResult.data ?? []).some(
                  (image) => String(image.quality_check_id) === String(check.id),
                )
              : false,
          },
          timeline: this.buildConsumerTimeline(
            String(order.status) as VendorFulfilmentStatus,
            String(checkout.created_at),
            history.map((entry) => ({
              status: String(entry.to_status) as VendorFulfilmentStatus,
              at: String(entry.created_at),
            })),
          ),
        };
      }),
    };
  }

  async getQualityProof(userId: string, orderId: string): Promise<ConsumerQualityProof> {
    const { data: order, error: orderError } = await this.db
      .from("vendor_orders")
      .select("id,checkout_id,customer_checkouts!inner(consumer_id)")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    const owner = order?.customer_checkouts as unknown as { consumer_id: string } | undefined;
    if (!order || owner?.consumer_id !== userId) {
      throw new CheckoutNotFoundError("Seller order was not found.");
    }
    const { data: proof, error: proofError } = await this.db
      .from("quality_check_images")
      .select("quality_check_id,storage_path,thumbnail_path,quality_checks!inner(status)")
      .eq("vendor_order_id", orderId)
      .eq("is_packing_proof", true)
      .eq("upload_status", "ready")
      .maybeSingle();
    if (proofError) throw new Error(proofError.message);
    const check = proof?.quality_checks as unknown as { status: string } | undefined;
    if (!proof?.thumbnail_path || check?.status !== "completed") {
      throw new CheckoutNotFoundError("Verified quality proof is not available.");
    }
    const [thumbnail, original] = await Promise.all([
      this.db.storage
        .from("quality-check-images")
        .createSignedUrl(String(proof.thumbnail_path), 600),
      this.db.storage.from("quality-check-images").createSignedUrl(String(proof.storage_path), 300),
    ]);
    if (thumbnail.error || original.error) {
      throw new Error(
        (thumbnail.error ?? original.error)?.message ?? "Quality proof signing failed.",
      );
    }
    return {
      qualityCheckId: String(proof.quality_check_id),
      status: "completed",
      thumbnailUrl: thumbnail.data.signedUrl,
      fullUrl: original.data.signedUrl,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  private buildConsumerTimeline(
    currentStatus: VendorFulfilmentStatus,
    confirmedAt: string,
    history: { status: VendorFulfilmentStatus; at: string }[],
  ): ConsumerOrderProgressStep[] {
    const steps: [ConsumerOrderProgressStep["status"], string][] = [
      ["confirmed", "Order confirmed"],
      ["awaiting_vendor_acceptance", "Waiting for seller"],
      ["accepted", "Seller accepted"],
      ["preparing", "Preparing your order"],
      ["quality_verified", "Quality verified"],
      ["ready_for_pickup", "Ready for pickup"],
    ];
    if (currentStatus === "cancelled") steps.push(["cancelled", "Order cancelled"]);
    if (currentStatus === "issue_reported") steps.push(["issue_reported", "Issue reported"]);
    const rank = steps.findIndex(([status]) => status === currentStatus);
    return steps.map(([status, label], index) => {
      const recorded = history.find((entry) => entry.status === status);
      return {
        status,
        label,
        completed: status === "confirmed" || rank >= index,
        current: status === currentStatus,
        at: status === "confirmed" ? confirmedAt : (recorded?.at ?? null),
      };
    });
  }

  private mapError(error: { code?: string; message: string }): Error {
    if (error.code === "P0002") return new CheckoutNotFoundError("The active cart was not found.");
    if (error.code === "23514" || error.code === "22023")
      return new CheckoutRejectedError(error.message);
    return new Error(error.message);
  }
}
