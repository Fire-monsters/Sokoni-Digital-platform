export const paymentProviders = ["pesapal", "market_pickup"] as const;

export type PaymentProvider = (typeof paymentProviders)[number];

export const paymentMethods = [
  "mtn_momo",
  "airtel_money",
  "visa",
  "mastercard",
  "card",
  "bank",
  "market_pickup",
  "unknown",
] as const;

export type PaymentMethod = (typeof paymentMethods)[number];
