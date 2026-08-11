export const vendorFulfilmentStatuses = [
  "awaiting_vendor_acceptance",
  "accepted",
  "preparing",
  "quality_verified",
  "ready_for_pickup",
  "cancelled",
  "issue_reported",
] as const;

export type VendorFulfilmentStatus = (typeof vendorFulfilmentStatuses)[number];

export const vendorOrderTransitionTargets = [
  "accepted",
  "preparing",
  "quality_verified",
  "ready_for_pickup",
  "cancelled",
  "issue_reported",
] as const;

export type VendorOrderTransitionTarget = (typeof vendorOrderTransitionTargets)[number];

export const vendorOrderTransitions: Readonly<
  Record<VendorFulfilmentStatus, readonly VendorOrderTransitionTarget[]>
> = {
  awaiting_vendor_acceptance: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["quality_verified", "issue_reported"],
  quality_verified: ["ready_for_pickup"],
  ready_for_pickup: [],
  cancelled: [],
  issue_reported: [],
};

export const qualityImageCompressionContract = {
  mimeType: "image/jpeg",
  longEdge: 1280,
  jpegQuality: 0.72,
  maxOriginalBytes: 500_000,
  thumbnailEdge: 320,
  thumbnailJpegQuality: 0.65,
  maxThumbnailBytes: 75_000,
} as const;

export interface VendorOrderItemSnapshot {
  id: string;
  listingId: string;
  productName: string;
  packageLabel: string;
  quantity: number;
  unitPriceUgx: number;
  lineTotalUgx: number;
  thumbnailUrl: string | null;
}

export interface VendorOrderFulfilment {
  type: "delivery" | "market_pickup";
  scheduleType: "immediate" | "scheduled";
  requestedFor: string | null;
}

export interface VendorOrderQualitySummary {
  id: string | null;
  status: "not_started" | "draft" | "completed" | "invalidated";
  imageCount: number;
  hasPackingProof: boolean;
}

export interface VendorOrderSummary {
  id: string;
  reference: string;
  status: VendorFulfilmentStatus;
  version: number;
  createdAt: string;
  subtotalUgx: number;
  itemCount: number;
  items: VendorOrderItemSnapshot[];
  fulfilment: VendorOrderFulfilment;
  qualityCheck: VendorOrderQualitySummary;
}

export interface VendorOrderTimelineEntry {
  status: VendorFulfilmentStatus;
  at: string;
  version: number;
}

export interface VendorOrderDetails extends VendorOrderSummary {
  updatedAt: string;
  timeline: VendorOrderTimelineEntry[];
  packingProofThumbnailUrl: string | null;
}

export interface VendorOrderPage {
  items: VendorOrderSummary[];
  nextCursor: string | null;
}

export interface VendorOrderTransitionResult {
  orderId: string;
  status: VendorFulfilmentStatus;
  version: number;
  operationId: string;
  duplicate: boolean;
}

export interface QualityImageUploadIntent {
  qualityCheckId: string;
  imageId: string;
  original: { path: string; token: string };
  thumbnail: { path: string; token: string };
  expiresAt: string;
  compression: typeof qualityImageCompressionContract;
}

export interface QualityImageUploadResult {
  qualityCheckId: string;
  imageId: string;
  uploadStatus: "ready";
  isPackingProof: boolean;
  thumbnailUrl: string;
  expiresAt: string;
  duplicate: boolean;
}

export interface PackingChecklist {
  itemsChecked: boolean;
  quantitiesChecked: boolean;
  packagingSecure: boolean;
}

export interface QualityCheckCompletionResult {
  qualityCheckId: string;
  status: "completed";
  verifiedAt: string;
  duplicate: boolean;
}

export interface ConsumerOrderProgressStep {
  status: "confirmed" | VendorFulfilmentStatus;
  label: string;
  completed: boolean;
  current: boolean;
  at: string | null;
}

export interface ConsumerSellerOrderProgress {
  id: string;
  reference: string;
  seller: { id: string; name: string; marketName: string | null };
  status: VendorFulfilmentStatus;
  itemCount: number;
  subtotalUgx: number;
  qualityCheck: { status: VendorOrderQualitySummary["status"]; hasProof: boolean };
  timeline: ConsumerOrderProgressStep[];
}

export interface ConsumerCheckoutProgress {
  checkoutId: string;
  reference: string;
  status: string;
  sellerOrders: ConsumerSellerOrderProgress[];
}

export interface ConsumerQualityProof {
  qualityCheckId: string;
  status: "completed";
  thumbnailUrl: string;
  fullUrl: string;
  expiresAt: string;
}
