import type {
  AvailabilityResult,
  ListingAvailability,
  VendorListing,
  VendorListingImage,
  VendorPriceRequest,
} from "@sokoni-digital/domain";

import { supabase } from "../../infrastructure/supabase/client.js";
import { ListingHttpError } from "./listings.errors.js";

export interface CreateListingInput {
  catalogProductId: string;
  packageQuantity: number;
  packageUnit: string;
  description?: string | undefined;
  availability: ListingAvailability;
  proposedPriceUgx: number;
}

export interface UpdateListingInput {
  catalogProductId?: string | undefined;
  packageQuantity?: number | undefined;
  packageUnit?: string | undefined;
  description?: string | undefined;
  availability?: ListingAvailability | undefined;
}

interface SellerRecord {
  id: string;
  verificationStatus: string;
}

function storageUrl(bucket: string, path: string | null): string | null {
  return path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
}

export class ListingsRepository {
  async getSellerForUser(userId: string, requireApproved = true): Promise<SellerRecord> {
    const { data: account, error: accountError } = await supabase
      .from("seller_accounts")
      .select("seller_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) throw new ListingHttpError(403, "FORBIDDEN", "A vendor account is required.");

    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("id,verification_status")
      .eq("id", account.seller_id)
      .single();

    if (sellerError) throw sellerError;
    if (requireApproved && seller.verification_status !== "approved") {
      throw new ListingHttpError(403, "FORBIDDEN", "Vendor approval is required.");
    }

    return { id: seller.id, verificationStatus: seller.verification_status };
  }

  async create(userId: string, input: CreateListingInput): Promise<VendorListing> {
    const seller = await this.getSellerForUser(userId);
    const { data: listing, error } = await supabase
      .from("listings")
      .insert({
        seller_id: seller.id,
        catalog_product_id: input.catalogProductId,
        package_quantity: input.packageQuantity,
        package_unit: input.packageUnit,
        description: input.description ?? null,
        availability: input.availability,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: priceError } = await supabase.from("listing_price_requests").insert({
      listing_id: listing.id,
      seller_id: seller.id,
      proposed_price_ugx: input.proposedPriceUgx,
      current_price_ugx: null,
    });

    if (priceError) {
      await supabase.from("listings").delete().eq("id", listing.id);
      throw priceError;
    }

    return this.getById(userId, listing.id);
  }

  async list(userId: string): Promise<VendorListing[]> {
    const seller = await this.getSellerForUser(userId);
    const { data, error } = await supabase
      .from("listings")
      .select("id")
      .eq("seller_id", seller.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return Promise.all(data.map((row) => this.getById(userId, row.id)));
  }

  async getById(userId: string, listingId: string): Promise<VendorListing> {
    const seller = await this.getSellerForUser(userId);
    const { data: listing, error } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_id", seller.id)
      .maybeSingle();

    if (error) throw error;
    if (!listing) throw new ListingHttpError(404, "NOT_FOUND", "Listing not found.");

    const [{ data: product, error: productError }, imagesResult, pricesResult] = await Promise.all([
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
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
      supabase
        .from("listing_price_requests")
        .select("id,proposed_price_ugx,current_price_ugx,status,review_note,created_at")
        .eq("listing_id", listing.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (productError) throw productError;
    if (imagesResult.error) throw imagesResult.error;
    if (pricesResult.error) throw pricesResult.error;

    const images: VendorListingImage[] = imagesResult.data.map((image) => ({
      id: image.id,
      url: storageUrl(image.storage_bucket, image.storage_path) ?? "",
      thumbnailUrl: storageUrl(image.storage_bucket, image.thumbnail_path),
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
      catalogProductId: listing.catalog_product_id,
      productName: product.name,
      categoryName: product.categories.name,
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

  async update(
    userId: string,
    listingId: string,
    input: UpdateListingInput,
  ): Promise<VendorListing> {
    const current = await this.getById(userId, listingId);

    if (current.status !== "draft" && current.status !== "changes_requested") {
      throw new ListingHttpError(409, "CONFLICT", "Only editable listings can be changed.");
    }

    const { error } = await supabase
      .from("listings")
      .update({
        ...(input.catalogProductId ? { catalog_product_id: input.catalogProductId } : {}),
        ...(input.packageQuantity ? { package_quantity: input.packageQuantity } : {}),
        ...(input.packageUnit ? { package_unit: input.packageUnit } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.availability ? { availability: input.availability } : {}),
        ...(current.status === "changes_requested" ? { status: "draft" as const } : {}),
      })
      .eq("id", listingId);

    if (error) throw error;
    return this.getById(userId, listingId);
  }

  async archive(userId: string, listingId: string): Promise<void> {
    await this.getById(userId, listingId);
    const { error } = await supabase
      .from("listings")
      .update({ status: "archived" })
      .eq("id", listingId);
    if (error) throw error;
  }

  async createPriceRequest(
    userId: string,
    listingId: string,
    proposedPriceUgx: number,
    reason?: string,
  ): Promise<VendorListing> {
    const seller = await this.getSellerForUser(userId);
    const listing = await this.getById(userId, listingId);
    const { error } = await supabase.from("listing_price_requests").insert({
      listing_id: listingId,
      seller_id: seller.id,
      proposed_price_ugx: proposedPriceUgx,
      current_price_ugx: listing.approvedPriceUgx,
      reason: reason ?? null,
    });

    if (error?.code === "23505") {
      throw new ListingHttpError(
        409,
        "CONFLICT",
        "This listing already has a pending price request.",
      );
    }
    if (error) throw error;
    return this.getById(userId, listingId);
  }

  async submit(userId: string, listingId: string): Promise<VendorListing> {
    const { error } = await supabase.rpc("submit_listing_for_approval", {
      requested_listing_id: listingId,
      requested_user_id: userId,
    });
    if (error) throw new ListingHttpError(409, "CONFLICT", error.message);
    return this.getById(userId, listingId);
  }

  async changeAvailability(
    userId: string,
    listingId: string,
    availability: ListingAvailability,
    expectedVersion: number,
    operationId: string,
  ): Promise<AvailabilityResult> {
    const { data, error } = await supabase.rpc("change_listing_availability", {
      requested_listing_id: listingId,
      requested_user_id: userId,
      requested_availability: availability,
      expected_version: expectedVersion,
      requested_operation_id: operationId,
    });

    if (error?.code === "40001") {
      throw new ListingHttpError(409, "CONFLICT", "The listing changed on another device.");
    }
    if (error) throw error;

    return {
      listingId: data.listing_id,
      availability: data.availability,
      version: data.version,
      updatedAt: data.created_at,
    };
  }
}
