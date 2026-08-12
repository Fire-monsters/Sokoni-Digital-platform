export class RiderOperationsHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code:
      | "BAD_REQUEST"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "OFFER_EXPIRED"
      | "OFFER_UNAVAILABLE"
      | "DELIVERY_ALREADY_ASSIGNED"
      | "DELIVERY_PROOF_REQUIRED"
      | "DELIVERY_PIN_EXPIRED"
      | "DELIVERY_PIN_LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "RiderOperationsHttpError";
  }
}

export function mapRiderOperationsDatabaseError(error: { code?: string; message: string }): Error {
  if (error.code === "P0002") {
    return new RiderOperationsHttpError(
      404,
      "NOT_FOUND",
      error.message.includes("offer") ? "Delivery offer not found." : "Rider profile not found.",
    );
  }
  if (error.code === "42501") {
    return new RiderOperationsHttpError(
      403,
      "FORBIDDEN",
      "An approved, active rider account is required.",
    );
  }
  if (error.code === "P0001" && error.message.includes("LOCATION_RATE_LIMITED")) {
    return new RiderOperationsHttpError(
      429,
      "RATE_LIMITED",
      "Location was updated too recently. Wait briefly and try again.",
    );
  }
  if (error.code === "P0001" && error.message.includes("AVAILABILITY_RATE_LIMITED")) {
    return new RiderOperationsHttpError(
      429,
      "RATE_LIMITED",
      "Availability was updated too recently. Wait briefly and try again.",
    );
  }
  if (error.code === "P0001" && error.message.includes("DELIVERY_OFFER_EXPIRED")) {
    return new RiderOperationsHttpError(409, "OFFER_EXPIRED", "This delivery offer has expired.");
  }
  if (error.code === "P0001" && error.message.includes("DELIVERY_ALREADY_ASSIGNED")) {
    return new RiderOperationsHttpError(
      409,
      "DELIVERY_ALREADY_ASSIGNED",
      "Another rider already accepted this delivery.",
    );
  }
  if (error.code === "P0001" && error.message.includes("DELIVERY_OFFER_NOT_PENDING")) {
    return new RiderOperationsHttpError(
      409,
      "OFFER_UNAVAILABLE",
      "This delivery offer is no longer available.",
    );
  }
  if (error.code === "40001") {
    return new RiderOperationsHttpError(
      409,
      "CONFLICT",
      "This record changed on the server. Refresh before trying again.",
    );
  }
  if (error.code === "23505") {
    return new RiderOperationsHttpError(
      409,
      "CONFLICT",
      "The operation ID was already used with different details.",
    );
  }
  if (error.code === "23514") {
    if (error.message.includes("DELIVERY_PROOF_REQUIRED")) {
      return new RiderOperationsHttpError(
        409,
        "DELIVERY_PROOF_REQUIRED",
        "Confirm the consumer PIN and upload delivery evidence before completing this delivery.",
      );
    }
    if (error.message.includes("DELIVERY_PIN_EXPIRED")) {
      return new RiderOperationsHttpError(
        409,
        "DELIVERY_PIN_EXPIRED",
        "The delivery PIN expired. Ask the consumer to generate a new one.",
      );
    }
    if (error.message.includes("DELIVERY_PIN_LOCKED")) {
      return new RiderOperationsHttpError(
        409,
        "DELIVERY_PIN_LOCKED",
        "PIN confirmation is locked. Ask the consumer to generate a new PIN.",
      );
    }
    if (error.message.includes("ALL_PICKUPS_REQUIRED")) {
      return new RiderOperationsHttpError(
        409,
        "CONFLICT",
        "Every seller handover must be confirmed before pickup is complete.",
      );
    }
    if (error.message.includes("RIDER_ARRIVAL_REQUIRED")) {
      return new RiderOperationsHttpError(
        409,
        "CONFLICT",
        "Record arrival at the market before confirming a seller handover.",
      );
    }
    return new RiderOperationsHttpError(
      409,
      "CONFLICT",
      error.message.includes("ACTIVE_DELIVERY")
        ? "Availability is managed automatically while a delivery is active."
        : "The rider availability change is not allowed.",
    );
  }
  if (error.code === "22023") {
    return new RiderOperationsHttpError(
      400,
      "BAD_REQUEST",
      "The rider operation contains invalid or stale data.",
    );
  }
  return new Error(error.message);
}
