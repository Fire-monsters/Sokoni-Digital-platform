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
import type { RiderLocationUpdateInput } from "@sokoni-digital/validation/delivery";

export interface RiderOperationsRepository {
  getOperationalState(userId: string): Promise<RiderOperationalState>;
  setAvailability(
    userId: string,
    availability: RiderSelectedAvailability,
    operationId: string,
  ): Promise<RiderAvailabilityResult>;
  updateLocation(
    userId: string,
    input: RiderLocationUpdateInput,
  ): Promise<RiderLocationUpdateResult>;
  acceptOffer(
    userId: string,
    offerId: string,
    expectedDeliveryVersion: number,
    operationId: string,
  ): Promise<DeliveryOfferAcceptanceResult>;
  getCurrentOffer(userId: string): Promise<RiderDeliveryOffer | null>;
  rejectOffer(
    userId: string,
    offerId: string,
    operationId: string,
  ): Promise<DeliveryOfferRejectionResult>;
  getCurrentDelivery(userId: string): Promise<RiderCurrentDelivery | null>;
  confirmPickup(
    userId: string,
    sellerOrderId: string,
    operationId: string,
  ): Promise<DeliveryPickupConfirmationResult>;
  transitionDelivery(
    userId: string,
    deliveryId: string,
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer",
    expectedVersion: number,
    operationId: string,
  ): Promise<DeliveryTransitionResult>;
  expireOffers(batchSize: number): Promise<number>;
}
