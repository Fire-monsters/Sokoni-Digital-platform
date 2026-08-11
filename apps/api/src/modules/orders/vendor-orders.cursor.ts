import type { VendorOrderCursor } from "./vendor-orders.types.js";

export class InvalidVendorOrderCursorError extends Error {
  readonly statusCode = 400;
  readonly code = "BAD_REQUEST";

  constructor() {
    super("The vendor order cursor is invalid.");
    this.name = "InvalidVendorOrderCursorError";
  }
}

export function encodeVendorOrderCursor(cursor: VendorOrderCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeVendorOrderCursor(encoded: string): VendorOrderCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<VendorOrderCursor>;
    if (
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      ) ||
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      throw new InvalidVendorOrderCursorError();
    }
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch (error) {
    if (error instanceof InvalidVendorOrderCursorError) throw error;
    throw new InvalidVendorOrderCursorError();
  }
}
