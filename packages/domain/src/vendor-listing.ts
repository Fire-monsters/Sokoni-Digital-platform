import type { ListingAvailability, ListingStatus } from "./catalogue.js";

export interface VendorListingImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface VendorPriceRequest {
  id: string;
  proposedPriceUgx: number;
  currentPriceUgx: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewNote: string | null;
  createdAt: string;
}

export interface VendorListing {
  id: string;
  catalogProductId: string;
  productName: string;
  categoryName: string;
  packageQuantity: number;
  packageUnit: string;
  description: string | null;
  approvedPriceUgx: number | null;
  status: ListingStatus;
  availability: ListingAvailability;
  version: number;
  updatedAt: string;
  images: VendorListingImage[];
  latestPriceRequest: VendorPriceRequest | null;
}

export interface ListingUploadIntent {
  imageId: string;
  original: { path: string; token: string };
  thumbnail: { path: string; token: string };
  expiresAt: string;
}

export interface AvailabilityResult {
  listingId: string;
  availability: ListingAvailability;
  version: number;
  updatedAt: string;
}

export interface AdminListingReview extends VendorListing {
  sellerId: string;
  vendorName: string;
  marketName: string | null;
  submittedAt: string;
  priceHistory: AdminPriceHistoryEntry[];
  auditHistory: CatalogueAuditEntry[];
}

export interface AdminPriceReview {
  requestId: string;
  listingId: string;
  productName: string;
  vendorName: string;
  currentPriceUgx: number | null;
  proposedPriceUgx: number;
  reason: string | null;
  createdAt: string;
  packageQuantity: number;
  packageUnit: string;
  marketName: string | null;
  images: VendorListingImage[];
  percentageChange: number | null;
  largePriceChange: boolean;
  recentUnavailableChanges: number;
  auditHistory: CatalogueAuditEntry[];
}

export interface AdminPriceHistoryEntry {
  requestId: string;
  previousPriceUgx: number | null;
  proposedPriceUgx: number;
  status: VendorPriceRequest["status"];
  reason: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface CatalogueAuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  previousState: Record<string, unknown> | null;
  nextState: Record<string, unknown> | null;
  createdAt: string;
}

export interface CatalogueReviewResult {
  operationId: string;
  duplicate: boolean;
  listingId: string;
  requestId: string | null;
  status: string;
  version: number;
}
