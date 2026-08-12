import { randomUUID } from "node:crypto";

import type {
  DeliveryEvidence,
  DeliveryIssueResult,
  DeliveryPin,
  DeliveryPinConfirmationResult,
  DeliveryProofUploadIntent,
  DeliveryProofUploadResult,
  DeliveryTransitionResult,
} from "@sokoni-digital/domain";
import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import { mapRiderOperationsDatabaseError, RiderOperationsHttpError } from "./delivery.errors.js";

const bucket = "delivery-proof-images";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The delivery proof workflow returned an invalid result.");
  }
  return value as Record<string, unknown>;
}

export class DeliveryProofService {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async rotatePin(userId: string, deliveryId: string): Promise<DeliveryPin> {
    const { data, error } = await this.db.rpc("rotate_delivery_pin", {
      p_delivery_id: deliveryId,
      p_consumer_user_id: userId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = record(data);
    return {
      deliveryId: String(value.deliveryId),
      pin: String(value.pin),
      expiresAt: String(value.expiresAt),
    };
  }

  async confirmPin(
    userId: string,
    deliveryId: string,
    pin: string,
    operationId: string,
  ): Promise<DeliveryPinConfirmationResult> {
    const { data, error } = await this.db.rpc("confirm_delivery_consumer_pin", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_pin: pin,
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = record(data);
    return {
      deliveryId: String(value.deliveryId),
      confirmed: Boolean(value.confirmed),
      confirmedAt: typeof value.confirmedAt === "string" ? value.confirmedAt : null,
      remainingAttempts: Number(value.remainingAttempts),
      locked: Boolean(value.locked),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async createUploadIntent(
    userId: string,
    deliveryId: string,
    input: {
      operationId: string;
      mimeType: "image/jpeg";
      byteSize: number;
      width: number;
      height: number;
      capturedAt: string;
      location?: { latitude: number; longitude: number; accuracyMeters: number } | null | undefined;
    },
  ): Promise<DeliveryProofUploadIntent> {
    const suggestedProofId = randomUUID();
    const { data: ensured, error: ensureError } = await this.db.rpc("ensure_delivery_proof", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_suggested_proof_id: suggestedProofId,
    });
    if (ensureError) throw mapRiderOperationsDatabaseError(ensureError);
    const ensuredValue = record(ensured);
    const proofId = String(ensuredValue.proofId);
    const transporterId = String(ensuredValue.transporterId);
    const imageId = input.operationId;
    const basePath = `${deliveryId}/${transporterId}/${imageId}`;
    const originalPath = `${basePath}/original.jpg`;
    const thumbnailPath = `${basePath}/thumbnail.jpg`;
    const locationArguments = input.location
      ? {
          p_latitude: input.location.latitude,
          p_longitude: input.location.longitude,
          p_accuracy_meters: input.location.accuracyMeters,
        }
      : {};
    const { error: intentError } = await this.db.rpc("create_delivery_proof_image_intent", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_proof_id: proofId,
      p_image_id: imageId,
      p_storage_path: originalPath,
      p_thumbnail_path: thumbnailPath,
      p_mime_type: input.mimeType,
      p_byte_size: input.byteSize,
      p_width: input.width,
      p_height: input.height,
      p_captured_at: input.capturedAt,
      ...locationArguments,
    });
    if (intentError) throw mapRiderOperationsDatabaseError(intentError);
    const [original, thumbnail] = await Promise.all([
      this.db.storage.from(bucket).createSignedUploadUrl(originalPath),
      this.db.storage.from(bucket).createSignedUploadUrl(thumbnailPath),
    ]);
    if (original.error || thumbnail.error) {
      await this.db
        .from("delivery_proof_images")
        .update({ upload_status: "invalidated" })
        .eq("id", imageId);
      throw new Error(
        (original.error ?? thumbnail.error)?.message ?? "Signed upload creation failed.",
      );
    }
    return {
      proofId,
      imageId,
      original: { path: originalPath, token: original.data.token },
      thumbnail: { path: thumbnailPath, token: thumbnail.data.token },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  async completeUpload(
    userId: string,
    deliveryId: string,
    imageId: string,
    input: { mimeType: "image/jpeg"; byteSize: number; width: number; height: number },
  ): Promise<DeliveryProofUploadResult> {
    const { data: image, error: imageError } = await this.db
      .from("delivery_proof_images")
      .select("storage_path,thumbnail_path")
      .eq("id", imageId)
      .eq("delivery_id", deliveryId)
      .maybeSingle();
    if (imageError) throw new Error(imageError.message);
    if (!image)
      throw mapRiderOperationsDatabaseError({
        code: "P0002",
        message: "delivery proof image not found",
      });
    await Promise.all([
      this.assertObjectExists(image.storage_path, input.byteSize),
      this.assertObjectExists(image.thumbnail_path),
    ]);
    const { data, error } = await this.db.rpc("finalize_delivery_proof_image", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_image_id: imageId,
      p_storage_path: image.storage_path,
      p_thumbnail_path: image.thumbnail_path,
      p_mime_type: input.mimeType,
      p_byte_size: input.byteSize,
      p_width: input.width,
      p_height: input.height,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = record(data);
    const signed = await this.db.storage.from(bucket).createSignedUrl(image.thumbnail_path, 600);
    if (signed.error) throw signed.error;
    return {
      proofId: String(value.proofId),
      imageId: String(value.imageId),
      status: "ready",
      duplicate: Boolean(value.duplicate),
      thumbnailUrl: signed.data.signedUrl,
    };
  }

  async completeDelivery(
    userId: string,
    deliveryId: string,
    expectedVersion: number,
    operationId: string,
  ): Promise<DeliveryTransitionResult> {
    const { data, error } = await this.db.rpc("complete_delivery", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_expected_version: expectedVersion,
      p_operation_id: operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = record(data);
    return {
      deliveryId: String(value.deliveryId),
      status: "delivered",
      version: Number(value.version),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async reportIssue(
    userId: string,
    deliveryId: string,
    input: { reason: string; note: string; expectedVersion: number; operationId: string },
  ): Promise<DeliveryIssueResult> {
    const { data, error } = await this.db.rpc("report_delivery_issue", {
      p_delivery_id: deliveryId,
      p_rider_user_id: userId,
      p_reason: input.reason,
      p_note: input.note,
      p_expected_version: input.expectedVersion,
      p_operation_id: input.operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = record(data);
    return {
      issueId: String(value.issueId),
      deliveryId: typeof value.deliveryId === "string" ? value.deliveryId : deliveryId,
      status: "open",
      duplicate: Boolean(value.duplicate),
    };
  }

  async getEvidence(
    userId: string,
    roles: readonly string[],
    deliveryId: string,
  ): Promise<DeliveryEvidence> {
    const { data: delivery, error: deliveryError } = await this.db
      .from("deliveries")
      .select("reference,completed_at,delivery_group_id")
      .eq("id", deliveryId)
      .maybeSingle();
    if (deliveryError) throw new Error(deliveryError.message);
    if (!delivery)
      throw mapRiderOperationsDatabaseError({ code: "P0002", message: "delivery not found" });
    if (!roles.some((role) => role === "admin" || role === "agent")) {
      const { data: group, error: groupError } = await this.db
        .from("delivery_groups")
        .select("consumer_id")
        .eq("id", delivery.delivery_group_id)
        .maybeSingle();
      if (groupError) throw new Error(groupError.message);
      if (group?.consumer_id !== userId)
        throw new RiderOperationsHttpError(
          403,
          "FORBIDDEN",
          "This evidence belongs to another consumer.",
        );
    }
    const [{ data: confirmation, error: confirmationError }, { data: images, error: imagesError }] =
      await Promise.all([
        this.db
          .from("delivery_confirmations")
          .select("confirmed_at")
          .eq("delivery_id", deliveryId)
          .maybeSingle(),
        this.db
          .from("delivery_proof_images")
          .select(
            "id,storage_path,thumbnail_path,captured_at,byte_size,width,height,latitude,longitude,accuracy_meters",
          )
          .eq("delivery_id", deliveryId)
          .eq("upload_status", "ready")
          .order("captured_at"),
      ]);
    if (confirmationError) throw new Error(confirmationError.message);
    if (imagesError) throw new Error(imagesError.message);
    const evidenceImages = await Promise.all(
      images.map(async (image) => {
        const [original, thumbnail] = await Promise.all([
          this.db.storage.from(bucket).createSignedUrl(image.storage_path, 300),
          this.db.storage.from(bucket).createSignedUrl(image.thumbnail_path, 600),
        ]);
        if (original.error || thumbnail.error) {
          throw new Error(
            (original.error ?? thumbnail.error)?.message ?? "Evidence signing failed.",
          );
        }
        const hasLocation =
          image.latitude !== null && image.longitude !== null && image.accuracy_meters !== null;
        return {
          id: image.id,
          originalUrl: original.data.signedUrl,
          thumbnailUrl: thumbnail.data.signedUrl,
          capturedAt: image.captured_at,
          byteSize: image.byte_size,
          width: image.width,
          height: image.height,
          location: hasLocation
            ? {
                latitude: Number(image.latitude),
                longitude: Number(image.longitude),
                accuracyMeters: Number(image.accuracy_meters),
              }
            : null,
        };
      }),
    );
    return {
      deliveryId,
      reference: delivery.reference,
      completedAt: delivery.completed_at,
      consumerConfirmedAt: confirmation?.confirmed_at ?? null,
      images: evidenceImages,
    };
  }

  private async assertObjectExists(path: string, expectedByteSize?: number): Promise<void> {
    const separator = path.lastIndexOf("/");
    const directory = path.slice(0, separator);
    const filename = path.slice(separator + 1);
    const { data, error } = await this.db.storage
      .from(bucket)
      .list(directory, { search: filename, limit: 2 });
    if (error) throw error;
    const object = data.find((candidate) => candidate.name === filename);
    if (!object)
      throw new RiderOperationsHttpError(
        400,
        "BAD_REQUEST",
        "Uploaded proof could not be verified.",
      );
    const storedSize = object.metadata?.size;
    if (
      expectedByteSize !== undefined &&
      typeof storedSize === "number" &&
      storedSize !== expectedByteSize
    ) {
      throw new RiderOperationsHttpError(
        400,
        "BAD_REQUEST",
        "Uploaded proof size does not match its metadata.",
      );
    }
  }
}
