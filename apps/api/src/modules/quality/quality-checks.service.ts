import { randomUUID } from "node:crypto";

import {
  qualityImageCompressionContract,
  type QualityCheckCompletionResult,
  type QualityImageUploadIntent,
  type QualityImageUploadResult,
} from "@sokoni-digital/domain";
import type {
  CompleteQualityCheckInput,
  CompleteQualityImageInput,
  QualityImageIntentInput,
} from "@sokoni-digital/validation/quality-check";

import { supabase } from "../../infrastructure/supabase/client.js";
import {
  mapVendorOrderDatabaseError,
  VendorOrderHttpError,
} from "../orders/vendor-orders.errors.js";
import { assertQualityImagePaths, qualityImageBasePath } from "./quality-checks.paths.js";

const bucket = "quality-check-images";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The quality workflow returned an invalid result.");
  }
  return value as Record<string, unknown>;
}

export class QualityChecksService {
  async createUploadIntent(
    userId: string,
    orderId: string,
    input: QualityImageIntentInput,
  ): Promise<QualityImageUploadIntent> {
    const suggestedCheckId = randomUUID();
    const { data: ensured, error: ensureError } = await supabase.rpc("ensure_quality_check", {
      p_order_id: orderId,
      p_actor_user_id: userId,
      p_suggested_check_id: suggestedCheckId,
    });
    if (ensureError) throw mapVendorOrderDatabaseError(ensureError);
    const ensuredValue = record(ensured);
    const qualityCheckId = String(ensuredValue.qualityCheckId);
    const sellerId = String(ensuredValue.sellerId);
    const imageId = input.operationId;
    const basePath = qualityImageBasePath(sellerId, orderId, qualityCheckId, imageId);
    const originalPath = `${basePath}/original.jpg`;
    const thumbnailPath = `${basePath}/thumbnail.jpg`;
    const { error: intentError } = await supabase.rpc("create_quality_image_intent", {
      p_order_id: orderId,
      p_actor_user_id: userId,
      p_quality_check_id: qualityCheckId,
      p_image_id: imageId,
      p_storage_path: originalPath,
      p_thumbnail_path: thumbnailPath,
      p_mime_type: input.mimeType,
      p_byte_size: input.byteSize,
      p_width: input.width,
      p_height: input.height,
    });
    if (intentError) throw mapVendorOrderDatabaseError(intentError);

    const [original, thumbnail] = await Promise.all([
      supabase.storage.from(bucket).createSignedUploadUrl(originalPath),
      supabase.storage.from(bucket).createSignedUploadUrl(thumbnailPath),
    ]);
    if (original.error || thumbnail.error) {
      await supabase
        .from("quality_check_images")
        .update({ upload_status: "invalidated" })
        .eq("id", imageId);
      throw new Error(
        (original.error ?? thumbnail.error)?.message ?? "Signed upload creation failed.",
      );
    }

    return {
      qualityCheckId,
      imageId,
      original: { path: originalPath, token: original.data.token },
      thumbnail: { path: thumbnailPath, token: thumbnail.data.token },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      compression: qualityImageCompressionContract,
    };
  }

  async completeUpload(
    userId: string,
    orderId: string,
    imageId: string,
    input: CompleteQualityImageInput,
  ): Promise<QualityImageUploadResult> {
    const { data: account, error: accountError } = await supabase
      .from("seller_accounts")
      .select("seller_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) {
      throw mapVendorOrderDatabaseError({ code: "42501", message: "Vendor account required." });
    }
    const { data: image, error: imageError } = await supabase
      .from("quality_check_images")
      .select("quality_check_id,quality_checks!inner(seller_id)")
      .eq("id", imageId)
      .eq("vendor_order_id", orderId)
      .maybeSingle();
    if (imageError) throw new Error(imageError.message);
    if (!image) throw mapVendorOrderDatabaseError({ code: "P0002", message: "not found" });
    const check = image.quality_checks;
    if (check.seller_id !== account.seller_id) {
      throw mapVendorOrderDatabaseError({ code: "42501", message: "Order not owned." });
    }
    const basePath = qualityImageBasePath(
      check.seller_id,
      orderId,
      image.quality_check_id,
      imageId,
    );
    assertQualityImagePaths(basePath, input.original.path, input.thumbnail.path);
    await Promise.all([
      this.assertObjectExists(input.original.path, input.original.byteSize),
      this.assertObjectExists(input.thumbnail.path, input.thumbnail.byteSize),
    ]);

    const { data, error } = await supabase.rpc("finalize_quality_image", {
      p_order_id: orderId,
      p_actor_user_id: userId,
      p_image_id: imageId,
      p_storage_path: input.original.path,
      p_thumbnail_path: input.thumbnail.path,
      p_mime_type: input.original.mimeType,
      p_byte_size: input.original.byteSize,
      p_width: input.original.width,
      p_height: input.original.height,
    });
    if (error) throw mapVendorOrderDatabaseError(error);
    const value = record(data);
    const signed = await supabase.storage.from(bucket).createSignedUrl(input.thumbnail.path, 600);
    if (signed.error) throw signed.error;
    return {
      qualityCheckId: String(value.qualityCheckId),
      imageId: String(value.imageId),
      uploadStatus: "ready",
      isPackingProof: Boolean(value.isPackingProof),
      thumbnailUrl: signed.data.signedUrl,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      duplicate: Boolean(value.duplicate),
    };
  }

  async completeCheck(
    userId: string,
    orderId: string,
    input: CompleteQualityCheckInput,
  ): Promise<QualityCheckCompletionResult> {
    const { data, error } = await supabase.rpc("complete_quality_check", {
      p_order_id: orderId,
      p_actor_user_id: userId,
      p_items_checked: input.checklist.itemsChecked,
      p_quantities_checked: input.checklist.quantitiesChecked,
      p_packaging_secure: input.checklist.packagingSecure,
      p_notes: input.notes ?? "",
      p_operation_id: input.operationId,
    });
    if (error) throw mapVendorOrderDatabaseError(error);
    const value = record(data);
    return {
      qualityCheckId: String(value.qualityCheckId),
      status: "completed",
      verifiedAt: String(value.verifiedAt),
      duplicate: Boolean(value.duplicate),
    };
  }

  private async assertObjectExists(path: string, expectedByteSize: number): Promise<void> {
    const separator = path.lastIndexOf("/");
    const directory = path.slice(0, separator);
    const filename = path.slice(separator + 1);
    const { data, error } = await supabase.storage.from(bucket).list(directory, {
      search: filename,
      limit: 2,
    });
    if (error) throw error;
    const object = data.find((candidate) => candidate.name === filename);
    if (!object) {
      throw new VendorOrderHttpError(400, "BAD_REQUEST", "Uploaded object could not be verified.");
    }
    const storedSize = object.metadata?.size;
    if (typeof storedSize === "number" && storedSize !== expectedByteSize) {
      throw new VendorOrderHttpError(
        400,
        "BAD_REQUEST",
        "Uploaded object size does not match its metadata.",
      );
    }
  }
}
