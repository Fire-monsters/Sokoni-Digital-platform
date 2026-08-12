import type {
  VendorFulfilmentStatus,
  VendorOrderDetails,
  VendorOrderFulfilment,
  VendorOrderItemSnapshot,
  VendorOrderQualitySummary,
  VendorOrderSummary,
  VendorOrderTransitionResult,
  VendorOrderTransitionTarget,
  DeliveryPickupConfirmationResult,
  DeliveryStatus,
} from "@sokoni-digital/domain";
import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import { VendorOrderHttpError, mapVendorOrderDatabaseError } from "./vendor-orders.errors.js";
import type { VendorOrderListInput, VendorOrderRepository } from "./vendor-orders.types.js";

interface OrderRow {
  id: string;
  reference: string;
  checkout_id: string;
  status: string;
  version: number;
  subtotal_ugx: number;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  vendor_order_id: string;
  listing_id: string;
  product_name: string;
  package_quantity: number;
  package_unit: string;
  unit_price_ugx: number;
  quantity: number;
  line_total_ugx: number;
  thumbnail_bucket: string | null;
  thumbnail_path: string | null;
}

interface FulfilmentRow {
  checkout_id: string;
  type: "delivery" | "market_pickup";
  schedule_type: "immediate" | "scheduled";
  requested_for: string | null;
}

interface QualityRow {
  id: string;
  vendor_order_id: string;
  status: "draft" | "completed" | "invalidated";
}

interface QualityImageRow {
  quality_check_id: string;
  is_packing_proof: boolean;
  upload_status: "pending" | "ready" | "invalidated";
}

export class SupabaseVendorOrdersRepository implements VendorOrderRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async list(
    userId: string,
    input: VendorOrderListInput,
  ): Promise<{ items: VendorOrderSummary[]; hasMore: boolean }> {
    const sellerId = await this.getApprovedSellerId(userId);
    let query = this.db
      .from("vendor_orders")
      .select("id,reference,checkout_id,status,version,subtotal_ugx,created_at,updated_at")
      .eq("seller_id", sellerId)
      .neq("status", "awaiting_payment")
      .neq("status", "expired")
      .neq("status", "confirmed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit + 1);

    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }
    if (input.cursor) {
      query = query.or(
        `created_at.lt.${input.cursor.createdAt},and(created_at.eq.${input.cursor.createdAt},id.lt.${input.cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data as OrderRow[]).slice(0, input.limit);
    return {
      items: await this.loadSummaries(rows),
      hasMore: data.length > input.limit,
    };
  }

  async get(userId: string, orderId: string): Promise<VendorOrderDetails> {
    const sellerId = await this.getApprovedSellerId(userId);
    const { data, error } = await this.db
      .from("vendor_orders")
      .select("id,reference,checkout_id,status,version,subtotal_ugx,created_at,updated_at")
      .eq("id", orderId)
      .eq("seller_id", sellerId)
      .neq("status", "awaiting_payment")
      .neq("status", "expired")
      .neq("status", "confirmed")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new VendorOrderHttpError(404, "NOT_FOUND", "Vendor order not found.");

    const [summary] = await this.loadSummaries([data]);
    if (!summary) throw new VendorOrderHttpError(404, "NOT_FOUND", "Vendor order not found.");
    const { data: history, error: historyError } = await this.db
      .from("vendor_order_status_history")
      .select("to_status,to_version,created_at")
      .eq("vendor_order_id", orderId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (historyError) throw new Error(historyError.message);
    const { data: proof, error: proofError } = await this.db
      .from("quality_check_images")
      .select("thumbnail_path")
      .eq("vendor_order_id", orderId)
      .eq("is_packing_proof", true)
      .eq("upload_status", "ready")
      .maybeSingle();
    if (proofError) throw new Error(proofError.message);
    const signedThumbnail = proof?.thumbnail_path
      ? await this.db.storage
          .from("quality-check-images")
          .createSignedUrl(proof.thumbnail_path, 600)
      : null;
    if (signedThumbnail?.error) throw signedThumbnail.error;
    const { data: pickup, error: pickupError } = await this.db
      .from("delivery_pickups")
      .select(
        "delivery_id,vendor_confirmed_at,rider_confirmed_at,collected_at,deliveries!inner(reference,status)",
      )
      .eq("seller_order_id", orderId)
      .maybeSingle();
    if (pickupError) throw new Error(pickupError.message);
    const pickupDelivery = pickup?.deliveries as unknown as
      { reference: string; status: string } | undefined;

    return {
      ...summary,
      updatedAt: data.updated_at,
      timeline: history.map((entry) => ({
        status: entry.to_status as VendorFulfilmentStatus,
        version: entry.to_version,
        at: entry.created_at,
      })),
      packingProofThumbnailUrl: signedThumbnail?.data.signedUrl ?? null,
      deliveryPickup:
        pickup && pickupDelivery
          ? {
              deliveryId: pickup.delivery_id,
              deliveryReference: pickupDelivery.reference,
              deliveryStatus: pickupDelivery.status as DeliveryStatus,
              vendorConfirmed: Boolean(pickup.vendor_confirmed_at),
              riderConfirmed: Boolean(pickup.rider_confirmed_at),
              collectedAt: pickup.collected_at,
            }
          : null,
    };
  }

  async transition(
    userId: string,
    orderId: string,
    toStatus: VendorOrderTransitionTarget,
    expectedVersion: number,
    operationId: string,
  ): Promise<VendorOrderTransitionResult> {
    const { data, error } = await this.db.rpc("transition_vendor_order", {
      p_order_id: orderId,
      p_actor_user_id: userId,
      p_to_status: toStatus,
      p_expected_version: expectedVersion,
      p_operation_id: operationId,
    });
    if (error) throw mapVendorOrderDatabaseError(error);
    const value = data as Record<string, unknown>;
    return {
      orderId: String(value.orderId),
      status: String(value.status) as VendorFulfilmentStatus,
      version: Number(value.version),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async confirmPickup(
    userId: string,
    orderId: string,
    operationId: string,
  ): Promise<DeliveryPickupConfirmationResult> {
    const { data, error } = await this.db.rpc("confirm_delivery_pickup", {
      p_seller_order_id: orderId,
      p_actor_user_id: userId,
      p_actor_type: "vendor",
      p_operation_id: operationId,
    });
    if (error) throw mapVendorOrderDatabaseError(error);
    const value = data as Record<string, unknown>;
    return {
      pickupId: String(value.pickupId),
      deliveryId: String(value.deliveryId),
      sellerOrderId: String(value.sellerOrderId),
      status: String(value.status) as "pending" | "collected",
      vendorConfirmed: Boolean(value.vendorConfirmed),
      riderConfirmed: Boolean(value.riderConfirmed),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  private async getApprovedSellerId(userId: string): Promise<string> {
    const { data: account, error: accountError } = await this.db
      .from("seller_accounts")
      .select("seller_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) {
      throw new VendorOrderHttpError(403, "FORBIDDEN", "An approved vendor account is required.");
    }
    const { data: seller, error: sellerError } = await this.db
      .from("sellers")
      .select("id,verification_status")
      .eq("id", account.seller_id)
      .maybeSingle();
    if (sellerError) throw new Error(sellerError.message);
    if (seller?.verification_status !== "approved") {
      throw new VendorOrderHttpError(403, "FORBIDDEN", "Vendor approval is required.");
    }
    return seller.id;
  }

  private async loadSummaries(rows: OrderRow[]): Promise<VendorOrderSummary[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((row) => row.id);
    const checkoutIds = rows.map((row) => row.checkout_id);
    const [itemsResult, fulfilmentsResult, checksResult] = await Promise.all([
      this.db
        .from("vendor_order_items")
        .select(
          "id,vendor_order_id,listing_id,product_name,package_quantity,package_unit,unit_price_ugx,quantity,line_total_ugx,thumbnail_bucket,thumbnail_path",
        )
        .in("vendor_order_id", orderIds)
        .order("created_at", { ascending: true }),
      this.db
        .from("checkout_fulfilments")
        .select("checkout_id,type,schedule_type,requested_for")
        .in("checkout_id", checkoutIds),
      this.db
        .from("quality_checks")
        .select("id,vendor_order_id,status")
        .in("vendor_order_id", orderIds),
    ]);
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    if (fulfilmentsResult.error) throw new Error(fulfilmentsResult.error.message);
    if (checksResult.error) throw new Error(checksResult.error.message);

    const checks = checksResult.data as QualityRow[];
    const checkIds = checks.map((check) => check.id);
    const imagesResult =
      checkIds.length === 0
        ? { data: [] as QualityImageRow[], error: null }
        : await this.db
            .from("quality_check_images")
            .select("quality_check_id,is_packing_proof,upload_status")
            .in("quality_check_id", checkIds);
    if (imagesResult.error) throw new Error(imagesResult.error.message);

    const items = itemsResult.data as ItemRow[];
    const fulfilments = fulfilmentsResult.data as FulfilmentRow[];
    const images = imagesResult.data as QualityImageRow[];

    return rows.map((row) => {
      const orderItems = items.filter((item) => item.vendor_order_id === row.id);
      const fulfilment = fulfilments.find((entry) => entry.checkout_id === row.checkout_id);
      if (!fulfilment) throw new Error(`Fulfilment is missing for vendor order ${row.id}.`);
      const check = checks.find((entry) => entry.vendor_order_id === row.id);
      const checkImages = check
        ? images.filter(
            (image) => image.quality_check_id === check.id && image.upload_status !== "invalidated",
          )
        : [];
      return {
        id: row.id,
        reference: row.reference,
        status: row.status as VendorFulfilmentStatus,
        version: row.version,
        createdAt: row.created_at,
        subtotalUgx: row.subtotal_ugx,
        itemCount: orderItems.reduce((total, item) => total + item.quantity, 0),
        items: orderItems.map((item) => this.mapItem(item)),
        fulfilment: this.mapFulfilment(fulfilment),
        qualityCheck: this.mapQuality(check, checkImages),
      };
    });
  }

  private mapItem(item: ItemRow): VendorOrderItemSnapshot {
    return {
      id: item.id,
      listingId: item.listing_id,
      productName: item.product_name,
      packageLabel: `${String(item.package_quantity)} ${item.package_unit}`,
      quantity: item.quantity,
      unitPriceUgx: item.unit_price_ugx,
      lineTotalUgx: item.line_total_ugx,
      thumbnailUrl:
        item.thumbnail_bucket && item.thumbnail_path
          ? this.db.storage.from(item.thumbnail_bucket).getPublicUrl(item.thumbnail_path).data
              .publicUrl
          : null,
    };
  }

  private mapFulfilment(fulfilment: FulfilmentRow): VendorOrderFulfilment {
    return {
      type: fulfilment.type,
      scheduleType: fulfilment.schedule_type,
      requestedFor: fulfilment.requested_for,
    };
  }

  private mapQuality(
    check: QualityRow | undefined,
    images: QualityImageRow[],
  ): VendorOrderQualitySummary {
    return {
      id: check?.id ?? null,
      status: check?.status ?? "not_started",
      imageCount: images.length,
      hasPackingProof: images.some(
        (image) => image.is_packing_proof && image.upload_status === "ready",
      ),
    };
  }
}
