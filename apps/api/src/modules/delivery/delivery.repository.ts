import type {
  DeliveryOfferAcceptanceResult,
  DeliveryOfferRejectionResult,
  DeliveryPickupConfirmationResult,
  DeliveryTransitionResult,
  RiderCurrentDelivery,
  RiderDeliveryOffer,
  RiderAvailabilityResult,
  RiderLocationUpdateResult,
  RiderOperationalState,
  RiderSelectedAvailability,
} from "@sokoni-digital/domain";
import type { Database } from "@sokoni-digital/database-types";
import type { RiderLocationUpdateInput } from "@sokoni-digital/validation/delivery";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import { mapRiderOperationsDatabaseError } from "./delivery.errors.js";
import type { RiderOperationsRepository } from "./delivery.types.js";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rider operation returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

function mapOperationalState(value: unknown): RiderOperationalState {
  const data = asObject(value);
  const rawLocation = data.lastLocation;
  const location = rawLocation === null ? null : asObject(rawLocation);

  return {
    transporterId: String(data.transporterId),
    displayName: String(data.displayName),
    verificationStatus: String(
      data.verificationStatus,
    ) as RiderOperationalState["verificationStatus"],
    availability: String(data.availability) as RiderOperationalState["availability"],
    availabilityUpdatedAt: String(data.availabilityUpdatedAt),
    locationIsFresh: Boolean(data.locationIsFresh),
    eligibleForOffers: Boolean(data.eligibleForOffers),
    lastLocation: location
      ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracyMeters: Number(location.accuracyMeters),
          capturedAt: String(location.capturedAt),
          receivedAt: String(location.receivedAt),
        }
      : null,
  };
}

function mapCurrentOffer(value: unknown): RiderDeliveryOffer | null {
  if (value === null) return null;
  const data = asObject(value);
  const market = asObject(data.market);
  return {
    id: String(data.id),
    deliveryId: String(data.deliveryId),
    deliveryReference: String(data.deliveryReference),
    deliveryVersion: Number(data.deliveryVersion),
    distanceKm: Number(data.distanceKm),
    feeUgx: Number(data.feeUgx),
    offeredAt: String(data.offeredAt),
    expiresAt: String(data.expiresAt),
    market: { id: String(market.id), name: String(market.name) },
    zoneName: String(data.zoneName),
    sellerCount: Number(data.sellerCount),
    packageCount: Number(data.packageCount),
  };
}

function mapCurrentDelivery(value: unknown): RiderCurrentDelivery | null {
  if (value === null) return null;
  const data = asObject(value);
  const market = asObject(data.market);
  const destination = asObject(data.destination);
  const pickups = Array.isArray(data.pickups) ? data.pickups.map(asObject) : [];
  return {
    id: String(data.id),
    reference: String(data.reference),
    status: String(data.status) as RiderCurrentDelivery["status"],
    version: Number(data.version),
    feeUgx: Number(data.feeUgx),
    assignedAt: String(data.assignedAt),
    market: { id: String(market.id), name: String(market.name) },
    destination: {
      label: String(destination.label),
      summary: String(destination.summary),
      zoneName: String(destination.zoneName),
      phoneNumber: String(destination.phoneNumber),
    },
    pickups: pickups.map((pickup) => ({
      id: String(pickup.id),
      sellerOrderId: String(pickup.sellerOrderId),
      sellerOrderReference: String(pickup.sellerOrderReference),
      sellerName: String(pickup.sellerName),
      itemCount: Number(pickup.itemCount),
      status: String(pickup.status) as "pending" | "collected",
      vendorConfirmed: Boolean(pickup.vendorConfirmed),
      riderConfirmed: Boolean(pickup.riderConfirmed),
      collectedAt: typeof pickup.collectedAt === "string" ? pickup.collectedAt : null,
    })),
    completion: {
      consumerConfirmed: false,
      readyProofImageCount: 0,
    },
  };
}

export class SupabaseRiderOperationsRepository implements RiderOperationsRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async getOperationalState(userId: string): Promise<RiderOperationalState> {
    const { data, error } = await this.db.rpc("get_transporter_operational_state", {
      p_user_id: userId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    return mapOperationalState(data);
  }

  async setAvailability(
    userId: string,
    availability: RiderSelectedAvailability,
    operationId: string,
  ): Promise<RiderAvailabilityResult> {
    const { data, error } = await this.db.rpc("set_transporter_availability", {
      p_user_id: userId,
      p_availability: availability,
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
    return {
      ...mapOperationalState(value),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async updateLocation(
    userId: string,
    input: RiderLocationUpdateInput,
  ): Promise<RiderLocationUpdateResult> {
    const { data, error } = await this.db.rpc("update_transporter_location", {
      p_user_id: userId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracyMeters,
      p_captured_at: input.capturedAt,
      p_operation_id: input.operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
    return {
      transporterId: String(value.transporterId),
      receivedAt: String(value.receivedAt),
      locationIsFresh: Boolean(value.locationIsFresh),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async acceptOffer(
    userId: string,
    offerId: string,
    expectedDeliveryVersion: number,
    operationId: string,
  ): Promise<DeliveryOfferAcceptanceResult> {
    const { data, error } = await this.db.rpc("accept_delivery_offer", {
      p_offer_id: offerId,
      p_transporter_user_id: userId,
      p_expected_delivery_version: expectedDeliveryVersion,
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
    return {
      offerId: String(value.offerId),
      deliveryId: String(value.deliveryId),
      transporterId: String(value.transporterId),
      status: "assigned",
      version: Number(value.version),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async getCurrentOffer(userId: string): Promise<RiderDeliveryOffer | null> {
    const { data, error } = await this.db.rpc("get_current_delivery_offer", { p_user_id: userId });
    if (error) throw mapRiderOperationsDatabaseError(error);
    return mapCurrentOffer(data);
  }

  async rejectOffer(
    userId: string,
    offerId: string,
    operationId: string,
  ): Promise<DeliveryOfferRejectionResult> {
    const { data, error } = await this.db.rpc("reject_delivery_offer", {
      p_offer_id: offerId,
      p_transporter_user_id: userId,
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
    return {
      offerId: String(value.offerId),
      status: "rejected",
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async getCurrentDelivery(userId: string): Promise<RiderCurrentDelivery | null> {
    const { data, error } = await this.db.rpc("get_current_rider_delivery", { p_user_id: userId });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const delivery = mapCurrentDelivery(data);
    if (!delivery) return null;
    const [{ data: confirmation, error: confirmationError }, { count, error: imageError }] =
      await Promise.all([
        this.db
          .from("delivery_confirmations")
          .select("confirmed_at")
          .eq("delivery_id", delivery.id)
          .maybeSingle(),
        this.db
          .from("delivery_proof_images")
          .select("id", { count: "exact", head: true })
          .eq("delivery_id", delivery.id)
          .eq("upload_status", "ready"),
      ]);
    if (confirmationError) throw new Error(confirmationError.message);
    if (imageError) throw new Error(imageError.message);
    delivery.completion = {
      consumerConfirmed: confirmation?.confirmed_at !== null && confirmation !== null,
      readyProofImageCount: count ?? 0,
    };
    return delivery;
  }

  async confirmPickup(
    userId: string,
    sellerOrderId: string,
    operationId: string,
  ): Promise<DeliveryPickupConfirmationResult> {
    const { data, error } = await this.db.rpc("confirm_delivery_pickup", {
      p_seller_order_id: sellerOrderId,
      p_actor_user_id: userId,
      p_actor_type: "rider",
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
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

  async transitionDelivery(
    userId: string,
    deliveryId: string,
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer",
    expectedVersion: number,
    operationId: string,
  ): Promise<DeliveryTransitionResult> {
    const { data, error } = await this.db.rpc("transition_delivery", {
      p_delivery_id: deliveryId,
      p_actor_user_id: userId,
      p_actor_type: "rider",
      p_to_status: toStatus,
      p_expected_version: expectedVersion,
      p_operation_id: operationId,
      p_metadata: {},
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = asObject(data);
    return {
      deliveryId: String(value.deliveryId),
      status: String(value.status) as DeliveryTransitionResult["status"],
      version: Number(value.version),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async expireOffers(batchSize: number): Promise<number> {
    const { data, error } = await this.db.rpc("expire_delivery_offers", {
      p_batch_size: batchSize,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    return data;
  }
}
