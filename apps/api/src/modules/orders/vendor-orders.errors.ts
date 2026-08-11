export class VendorOrderHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code:
      "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "PACKING_IMAGE_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "VendorOrderHttpError";
  }
}

export function mapVendorOrderDatabaseError(error: { code?: string; message: string }): Error {
  if (error.code === "P0002") {
    return new VendorOrderHttpError(404, "NOT_FOUND", "Vendor order not found.");
  }
  if (error.code === "42501") {
    return new VendorOrderHttpError(403, "FORBIDDEN", "This vendor does not own the order.");
  }
  if (error.code === "40001") {
    return new VendorOrderHttpError(
      409,
      "CONFLICT",
      "The vendor order changed on another device. Refresh and try again.",
    );
  }
  if (error.code === "23505") {
    return new VendorOrderHttpError(
      409,
      "CONFLICT",
      "The operation ID was already used for another transition.",
    );
  }
  if (error.code === "23514" && error.message.includes("PACKING_IMAGE_REQUIRED")) {
    return new VendorOrderHttpError(
      409,
      "PACKING_IMAGE_REQUIRED",
      "A completed quality check with a verified packing image is required.",
    );
  }
  if (error.code === "23514") {
    return new VendorOrderHttpError(409, "CONFLICT", "The status transition is not allowed.");
  }
  if (error.code === "22023") {
    return new VendorOrderHttpError(400, "BAD_REQUEST", "The requested status is invalid.");
  }
  return new Error(error.message);
}
