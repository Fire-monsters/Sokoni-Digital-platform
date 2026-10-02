export type CropCategory = "cash" | "food";
export type BusinessKind = "farmer" | "sme" | "warehouse";
export type BusinessStatus =
  "draft" | "submitted" | "changes_requested" | "approved" | "rejected" | "suspended";
export interface AgriculturalProduct {
  id: string;
  slug: string;
  name: string;
  categories: CropCategory[];
}
export interface BusinessAccount {
  id: string;
  kind: BusinessKind;
  name: string;
  location: string;
  status: BusinessStatus;
  version: number;
  reviewReason: string | null;
  canTrade: boolean;
  categories: CropCategory[];
  productIds: string[];
}
export interface BusinessAnalyticsContext {
  businessId: string;
  categories: CropCategory[];
  productIds: string[];
  defaultScope: "selected_products" | "all_products";
  reportingTimezone: "Africa/Kampala";
  metricsAvailable: false;
}
export interface BusinessAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
  phoneVerified: boolean;
}
export interface BusinessMutation {
  operationId: string;
  expectedVersion: number;
}
export interface CreateBusinessInput {
  operationId: string;
  kind: "farmer" | "sme";
  name: string;
  location: string;
}
export interface BusinessPreferencesInput extends BusinessMutation {
  categories: CropCategory[];
  productIds: string[];
}
export interface BusinessReviewInput extends BusinessMutation {
  status: "approved" | "rejected" | "changes_requested" | "suspended";
  reason: string;
}
