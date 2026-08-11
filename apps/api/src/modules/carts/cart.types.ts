export interface CartOwner {
  consumerId: string | null;
  guestTokenHash: string | null;
  installationId: string | null;
}

export interface CartAdjustment {
  listingId: string;
  type: "ITEM_REMOVED" | "PRICE_CHANGED" | "QUANTITY_REDUCED" | "UNAVAILABLE";
  requestedQuantity: number;
  acceptedQuantity: number;
  message: string;
}

export interface CartItemView {
  id: string;
  listingId: string;
  quantity: number;
  unitPriceUgx: number;
  lineTotalUgx: number;
  listingVersion: number;
  productName: string;
  packageLabel: string;
  seller: { id: string; name: string };
  availableStock: number;
  available: boolean;
}

export interface CartView {
  id: string;
  marketId: string;
  status: string;
  currencyCode: string;
  version: number;
  items: CartItemView[];
  itemCount: number;
  subtotalUgx: number;
  valid: boolean;
}
