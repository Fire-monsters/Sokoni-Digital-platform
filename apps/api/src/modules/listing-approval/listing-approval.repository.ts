import type {
  AdminListingReview,
  AdminPriceReview,
  VendorListingImage,
  VendorPriceRequest,
} from "@sokoni-digital/domain";

import { supabase } from "../../infrastructure/supabase/client.js";
import { ListingHttpError } from "../listings/listings.errors.js";

export class ListingApprovalRepository {
  async listPendingPrices(): Promise<AdminPriceReview[]> {
    const { data, error } = await supabase
      .from("listing_price_requests")
      .select("id,listing_id,seller_id,proposed_price_ugx,current_price_ugx,reason,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const reviews = await Promise.all(
      data.map(async (request) => {
        const [listing, seller] = await Promise.all([
          supabase
            .from("listings")
            .select("status,catalog_products!inner(name)")
            .eq("id", request.listing_id)
            .single(),
          supabase.from("sellers").select("business_name").eq("id", request.seller_id).single(),
        ]);
        if (listing.error) throw listing.error;
        if (seller.error) throw seller.error;
        if (listing.data.status !== "active" && listing.data.status !== "paused") return null;
        return {
          requestId: request.id,
          listingId: request.listing_id,
          productName: listing.data.catalog_products.name,
          vendorName: seller.data.business_name,
          currentPriceUgx: request.current_price_ugx,
          proposedPriceUgx: request.proposed_price_ugx,
          reason: request.reason,
          createdAt: request.created_at,
        };
      }),
    );
    return reviews.filter((review): review is AdminPriceReview => review !== null);
  }
  async listPending(): Promise<AdminListingReview[]> {
    const { data, error } = await supabase
      .from("listings")
      .select("id")
      .eq("status", "pending_approval")
      .order("updated_at", { ascending: true });
    if (error) throw error;
    return Promise.all(data.map((listing) => this.getListing(listing.id)));
  }

  async getListing(listingId: string): Promise<AdminListingReview> {
    const { data: listing, error } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();
    if (error) throw error;
    if (!listing) throw new ListingHttpError(404, "NOT_FOUND", "Listing not found.");

    const [sellerResult, productResult, imagesResult, pricesResult] = await Promise.all([
      supabase
        .from("sellers")
        .select("business_name,markets(name)")
        .eq("id", listing.seller_id)
        .single(),
      supabase
        .from("catalog_products")
        .select("name,categories!inner(name)")
        .eq("id", listing.catalog_product_id)
        .single(),
      supabase
        .from("listing_images")
        .select("id,storage_bucket,storage_path,thumbnail_path,sort_order,is_primary")
        .eq("listing_id", listing.id)
        .eq("upload_status", "ready")
        .order("sort_order"),
      supabase
        .from("listing_price_requests")
        .select("id,proposed_price_ugx,current_price_ugx,status,review_note,created_at")
        .eq("listing_id", listing.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (sellerResult.error) throw sellerResult.error;
    if (productResult.error) throw productResult.error;
    if (imagesResult.error) throw imagesResult.error;
    if (pricesResult.error) throw pricesResult.error;

    const images: VendorListingImage[] = imagesResult.data.map((image) => ({
      id: image.id,
      url: supabase.storage.from(image.storage_bucket).getPublicUrl(image.storage_path).data
        .publicUrl,
      thumbnailUrl: image.thumbnail_path
        ? supabase.storage.from(image.storage_bucket).getPublicUrl(image.thumbnail_path).data
            .publicUrl
        : null,
      sortOrder: image.sort_order,
      isPrimary: image.is_primary,
    }));
    const price = pricesResult.data.at(0);
    const latestPriceRequest: VendorPriceRequest | null = price
      ? {
          id: price.id,
          proposedPriceUgx: price.proposed_price_ugx,
          currentPriceUgx: price.current_price_ugx,
          status: price.status,
          reviewNote: price.review_note,
          createdAt: price.created_at,
        }
      : null;

    return {
      id: listing.id,
      sellerId: listing.seller_id,
      vendorName: sellerResult.data.business_name,
      marketName: sellerResult.data.markets?.name ?? null,
      catalogProductId: listing.catalog_product_id,
      productName: productResult.data.name,
      categoryName: productResult.data.categories.name,
      packageQuantity: listing.package_quantity,
      packageUnit: listing.package_unit,
      description: listing.description,
      approvedPriceUgx: listing.approved_price_ugx,
      status: listing.status,
      availability: listing.availability,
      version: listing.version,
      updatedAt: listing.updated_at,
      images,
      latestPriceRequest,
    };
  }

  async approveListing(listingId: string, adminId: string, reviewNote?: string) {
    const { error } = await supabase.rpc("approve_listing_and_price", {
      requested_listing_id: listingId,
      requested_admin_id: adminId,
      ...(reviewNote ? { requested_review_note: reviewNote } : {}),
    });
    if (error) throw new ListingHttpError(409, "CONFLICT", error.message);
    return this.getListing(listingId);
  }

  async requestChanges(listingId: string, adminId: string, reviewNote: string) {
    const { error } = await supabase.rpc("request_listing_changes", {
      requested_listing_id: listingId,
      requested_admin_id: adminId,
      requested_note: reviewNote,
    });
    if (error) throw new ListingHttpError(409, "CONFLICT", error.message);
    return this.getListing(listingId);
  }

  async reviewPrice(
    requestId: string,
    adminId: string,
    decision: "approved" | "rejected",
    reviewNote?: string,
  ) {
    const { data, error } = await supabase.rpc("review_price_request", {
      requested_request_id: requestId,
      requested_admin_id: adminId,
      requested_decision: decision,
      ...(reviewNote ? { requested_note: reviewNote } : {}),
    });
    if (error) throw new ListingHttpError(409, "CONFLICT", error.message);
    return {
      requestId: data.id,
      listingId: data.listing_id,
      status: data.status,
      proposedPriceUgx: data.proposed_price_ugx,
    };
  }
}
