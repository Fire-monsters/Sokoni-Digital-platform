export const marketPickupCollectionMethods = ["cash", "mobile_money", "card", "other"] as const;

export type MarketPickupCollectionMethod = (typeof marketPickupCollectionMethods)[number];

export interface RecordMarketPickupPaymentInput {
  checkoutId: string;
  amountReceived: number;
  currency: "UGX";
  paymentMethod: MarketPickupCollectionMethod;
  pickupCode: string;
  operationId: string;
}

export interface MarketPickupPaymentRecord {
  paymentAttemptId: string;
  checkoutId: string;
  status: "successful";
  duplicate: boolean;
  recordedAt: string;
}
