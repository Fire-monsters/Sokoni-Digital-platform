import { randomUUID } from "node:crypto";

import type { ListingUploadIntent, VendorListingImage } from "@sokoni-digital/domain";

import { supabase } from "../../infrastructure/supabase/client.js";
import { ListingHttpError } from "./listings.errors.js";
import { assertListingImagePaths } from "./listing-images.paths.js";
import { ListingsRepository } from "./listings.repository.js";

const bucket = "listing-images";

interface UploadMetadata {
  original: {
    path: string;
    mimeType: "image/jpeg" | "image/webp";
    byteSize: number;
    width: number;
    height: number;
  };
  thumbnail: {
    path: string;
    mimeType: "image/jpeg" | "image/webp";
    byteSize: number;
    width: number;
    height: number;
  };
  blurHash: string | null;
}

export class ListingImagesService {
  constructor(private readonly listings = new ListingsRepository()) {}

  async createIntent(
    userId: string,
    listingId: string,
    mimeType: "image/jpeg" | "image/webp",
  ): Promise<ListingUploadIntent> {
    const listing = await this.listings.getById(userId, listingId);
    const seller = await this.listings.getSellerForUser(userId);

    if (listing.status !== "draft" && listing.status !== "changes_requested") {
      throw new ListingHttpError(409, "CONFLICT", "Images can only be added to editable listings.");
    }
    if (listing.images.length >= 4) {
      throw new ListingHttpError(409, "CONFLICT", "A listing can have at most four images.");
    }

    const imageId = randomUUID();
    const extension = mimeType === "image/webp" ? "webp" : "jpg";
    const basePath = `${seller.id}/${listingId}/${imageId}`;
    const originalPath = `${basePath}/original-${randomUUID()}.${extension}`;
    const thumbnailPath = `${basePath}/thumbnail-${randomUUID()}.${extension}`;
    const [original, thumbnail] = await Promise.all([
      supabase.storage.from(bucket).createSignedUploadUrl(originalPath),
      supabase.storage.from(bucket).createSignedUploadUrl(thumbnailPath),
    ]);

    if (original.error) throw original.error;
    if (thumbnail.error) throw thumbnail.error;

    return {
      imageId,
      original: { path: originalPath, token: original.data.token },
      thumbnail: { path: thumbnailPath, token: thumbnail.data.token },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  async complete(
    userId: string,
    listingId: string,
    imageId: string,
    metadata: UploadMetadata,
  ): Promise<VendorListingImage> {
    const listing = await this.listings.getById(userId, listingId);
    const seller = await this.listings.getSellerForUser(userId);
    const expectedPrefix = `${seller.id}/${listingId}/${imageId}/`;

    if (listing.status !== "draft" && listing.status !== "changes_requested") {
      throw new ListingHttpError(409, "CONFLICT", "Images can only be added to editable listings.");
    }

    assertListingImagePaths(expectedPrefix, metadata.original.path, metadata.thumbnail.path);

    await Promise.all([
      this.assertObjectExists(metadata.original.path),
      this.assertObjectExists(metadata.thumbnail.path),
    ]);

    const { data, error } = await supabase
      .from("listing_images")
      .insert({
        id: imageId,
        listing_id: listingId,
        storage_bucket: bucket,
        storage_path: metadata.original.path,
        thumbnail_path: metadata.thumbnail.path,
        mime_type: metadata.original.mimeType,
        width: metadata.original.width,
        height: metadata.original.height,
        byte_size: metadata.original.byteSize,
        blur_hash: metadata.blurHash,
        sort_order: listing.images.length,
        is_primary: listing.images.length === 0,
        upload_status: "ready",
      })
      .select("id,storage_bucket,storage_path,thumbnail_path,sort_order,is_primary")
      .single();

    if (error) throw error;
    return {
      id: data.id,
      url: supabase.storage.from(bucket).getPublicUrl(data.storage_path).data.publicUrl,
      thumbnailUrl: data.thumbnail_path
        ? supabase.storage.from(bucket).getPublicUrl(data.thumbnail_path).data.publicUrl
        : null,
      sortOrder: data.sort_order,
      isPrimary: data.is_primary,
    };
  }

  private async assertObjectExists(path: string): Promise<void> {
    const separator = path.lastIndexOf("/");
    const directory = path.slice(0, separator);
    const filename = path.slice(separator + 1);
    const { data, error } = await supabase.storage.from(bucket).list(directory, {
      search: filename,
      limit: 2,
    });

    if (error) throw error;
    if (!data.some((object) => object.name === filename)) {
      throw new ListingHttpError(400, "BAD_REQUEST", "Uploaded object could not be verified.");
    }
  }
}
