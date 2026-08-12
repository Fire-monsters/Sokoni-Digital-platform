import type { RiderSelectedAvailability } from "@sokoni-digital/domain";
import type { RiderLocationUpdateInput } from "@sokoni-digital/validation/delivery";

import type { RiderOperationsRepository } from "./delivery.types.js";

export class RiderOperationsService {
  constructor(private readonly repository: RiderOperationsRepository) {}

  getOperationalState(userId: string) {
    return this.repository.getOperationalState(userId);
  }

  setAvailability(userId: string, availability: RiderSelectedAvailability, operationId: string) {
    return this.repository.setAvailability(userId, availability, operationId);
  }

  updateLocation(userId: string, input: RiderLocationUpdateInput) {
    return this.repository.updateLocation(userId, input);
  }

  acceptOffer(
    userId: string,
    offerId: string,
    expectedDeliveryVersion: number,
    operationId: string,
  ) {
    return this.repository.acceptOffer(userId, offerId, expectedDeliveryVersion, operationId);
  }

  getCurrentOffer(userId: string) {
    return this.repository.getCurrentOffer(userId);
  }
  rejectOffer(userId: string, offerId: string, operationId: string) {
    return this.repository.rejectOffer(userId, offerId, operationId);
  }
  getCurrentDelivery(userId: string) {
    return this.repository.getCurrentDelivery(userId);
  }
  confirmPickup(userId: string, sellerOrderId: string, operationId: string) {
    return this.repository.confirmPickup(userId, sellerOrderId, operationId);
  }
  transitionDelivery(
    userId: string,
    deliveryId: string,
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer",
    expectedVersion: number,
    operationId: string,
  ) {
    return this.repository.transitionDelivery(
      userId,
      deliveryId,
      toStatus,
      expectedVersion,
      operationId,
    );
  }
}
