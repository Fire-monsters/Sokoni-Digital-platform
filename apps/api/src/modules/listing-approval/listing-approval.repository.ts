import type { Database, Json } from "@sokoni-digital/database-types";
import type {
  AdminListingReview,
  AdminPriceReview,
  CatalogueReviewResult,
  VendorListingImage,
} from "@sokoni-digital/domain";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import { ListingHttpError } from "../listings/listings.errors.js";
import type { AuditWriteContext } from "../admin/workflows/index.js";

interface StoredImage {
  id: string;
  storageBucket: string;
  storagePath: string;
  thumbnailPath: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

type StoredListingReview = Omit<AdminListingReview, "images"> & { images: StoredImage[] };
type StoredPriceReview = Omit<AdminPriceReview, "images"> & { images: StoredImage[] };

export interface CatalogueReviewRepository {
  listPending(): Promise<AdminListingReview[]>;
  listPendingPrices(): Promise<AdminPriceReview[]>;
  getListing(listingId: string): Promise<AdminListingReview>;
  reviewListing(input: {
    listingId: string;
    adminId: string;
    decision: "approved" | "changes_requested";
    reviewNote?: string | undefined;
    expectedVersion: number;
    operationId: string;
    auditContext: AuditWriteContext;
  }): Promise<CatalogueReviewResult>;
  reviewPrice(input: {
    requestId: string;
    adminId: string;
    decision: "approved" | "rejected";
    reviewNote?: string | undefined;
    operationId: string;
    auditContext: AuditWriteContext;
  }): Promise<CatalogueReviewResult>;
}

function mapDatabaseError(error: { code?: string; message: string }): ListingHttpError {
  if (error.code === "P0002") return new ListingHttpError(404, "NOT_FOUND", error.message);
  if (error.code === "40001") return new ListingHttpError(409, "CONFLICT", error.message);
  return new ListingHttpError(409, "CONFLICT", error.message);
}

function storedImages(value: unknown): StoredImage[] {
  return Array.isArray(value) ? (value as StoredImage[]) : [];
}

export class SupabaseCatalogueReviewRepository implements CatalogueReviewRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  private images(images: StoredImage[]): VendorListingImage[] {
    return images.map((image) => ({
      id: image.id,
      url: this.db.storage.from(image.storageBucket).getPublicUrl(image.storagePath).data.publicUrl,
      thumbnailUrl: image.thumbnailPath
        ? this.db.storage.from(image.storageBucket).getPublicUrl(image.thumbnailPath).data.publicUrl
        : null,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }));
  }

  private listing(value: unknown): AdminListingReview {
    const review = value as StoredListingReview;
    return { ...review, images: this.images(storedImages(review.images)) };
  }

  private price(value: unknown): AdminPriceReview {
    const review = value as StoredPriceReview;
    return { ...review, images: this.images(storedImages(review.images)) };
  }

  async listPending(): Promise<AdminListingReview[]> {
    const { data, error } = await this.db.rpc("get_admin_listing_review_queue");
    if (error) throw mapDatabaseError(error);
    return (Array.isArray(data) ? data : []).map((review) => this.listing(review));
  }

  async listPendingPrices(): Promise<AdminPriceReview[]> {
    const { data, error } = await this.db.rpc("get_admin_price_review_queue");
    if (error) throw mapDatabaseError(error);
    return (Array.isArray(data) ? data : []).map((review) => this.price(review));
  }

  async getListing(listingId: string): Promise<AdminListingReview> {
    const { data, error } = await this.db.rpc("get_admin_listing_review", {
      p_listing_id: listingId,
    });
    if (error) throw mapDatabaseError(error);
    if (!data) throw new ListingHttpError(404, "NOT_FOUND", "Listing not found.");
    return this.listing(data);
  }

  async reviewListing(input: {
    listingId: string;
    adminId: string;
    decision: "approved" | "changes_requested";
    reviewNote?: string | undefined;
    expectedVersion: number;
    operationId: string;
    auditContext: AuditWriteContext;
  }): Promise<CatalogueReviewResult> {
    const { data, error } = await this.db.rpc("admin_review_listing_audited", {
      p_listing_id: input.listingId,
      p_admin_id: input.adminId,
      p_decision: input.decision,
      p_review_note: input.reviewNote ?? "",
      p_expected_version: input.expectedVersion,
      p_operation_id: input.operationId,
      p_audit_context: input.auditContext as unknown as Json,
    });
    if (error) throw mapDatabaseError(error);
    return data as unknown as CatalogueReviewResult;
  }

  async reviewPrice(input: {
    requestId: string;
    adminId: string;
    decision: "approved" | "rejected";
    reviewNote?: string | undefined;
    operationId: string;
    auditContext: AuditWriteContext;
  }): Promise<CatalogueReviewResult> {
    const { data, error } = await this.db.rpc("admin_review_price_request_audited", {
      p_request_id: input.requestId,
      p_admin_id: input.adminId,
      p_decision: input.decision,
      p_review_note: input.reviewNote ?? "",
      p_operation_id: input.operationId,
      p_audit_context: input.auditContext as unknown as Json,
    });
    if (error) throw mapDatabaseError(error);
    return data as unknown as CatalogueReviewResult;
  }
}
