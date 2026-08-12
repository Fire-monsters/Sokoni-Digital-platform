import {
  completeDeliveryProofUpload,
  createDeliveryProofUploadIntent,
  type ApiClientOptions,
} from "@sokoni-digital/api-client";
import { deliveryProofImageContract } from "@sokoni-digital/domain";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { mobileSupabase } from "@/lib/supabase";

export interface PreparedDeliveryProof {
  operationId: string;
  capturedAt: string;
  originalUri: string;
  thumbnailUri: string;
  originalByteSize: number;
  originalWidth: number;
  originalHeight: number;
  location: { latitude: number; longitude: number; accuracyMeters: number } | null;
}

const proofDirectory = new Directory(Paths.document, "pending-delivery-proofs");

async function persistRenderedFile(sourceUri: string, filename: string): Promise<File> {
  proofDirectory.create({ idempotent: true, intermediates: true });
  const destination = new File(proofDirectory, filename);
  if (destination.exists) destination.delete();
  new File(sourceUri).copy(destination);
  return destination;
}

async function prepareAsset(
  asset: ImagePicker.ImagePickerAsset,
  location: PreparedDeliveryProof["location"],
): Promise<PreparedDeliveryProof> {
  const operationId = Crypto.randomUUID();
  const scale = Math.min(
    1,
    deliveryProofImageContract.maximumLongEdgePixels / Math.max(asset.width, asset.height),
  );
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  context.resize({ width, height });
  const rendered = await context.renderAsync();
  const original = await rendered.saveAsync({
    compress: 0.68,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const thumbnailScale =
    deliveryProofImageContract.thumbnailLongEdgePixels / Math.max(asset.width, asset.height);
  const thumbnailWidth = Math.max(1, Math.round(asset.width * thumbnailScale));
  const thumbnailHeight = Math.max(1, Math.round(asset.height * thumbnailScale));
  const thumbnailContext = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  thumbnailContext.resize({ width: thumbnailWidth, height: thumbnailHeight });
  const thumbnailRendered = await thumbnailContext.renderAsync();
  const thumbnail = await thumbnailRendered.saveAsync({
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const originalFile = await persistRenderedFile(original.uri, `${operationId}-original.jpg`);
  const thumbnailFile = await persistRenderedFile(thumbnail.uri, `${operationId}-thumbnail.jpg`);
  if (originalFile.size > deliveryProofImageContract.maximumBytes) {
    originalFile.delete();
    thumbnailFile.delete();
    throw new Error("The compressed proof is still too large. Retake the photo in lower detail.");
  }
  return {
    operationId,
    capturedAt: new Date().toISOString(),
    originalUri: originalFile.uri,
    thumbnailUri: thumbnailFile.uri,
    originalByteSize: originalFile.size,
    originalWidth: width,
    originalHeight: height,
    location,
  };
}

export async function captureDeliveryProof(
  location: PreparedDeliveryProof["location"],
): Promise<PreparedDeliveryProof | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Camera permission is required for delivery evidence.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    cameraType: ImagePicker.CameraType.back,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return prepareAsset(result.assets[0], location);
}

export async function uploadDeliveryProof(
  options: ApiClientOptions,
  deliveryId: string,
  proof: PreparedDeliveryProof,
) {
  const intent = await createDeliveryProofUploadIntent(options, deliveryId, {
    operationId: proof.operationId,
    mimeType: "image/jpeg",
    byteSize: proof.originalByteSize,
    width: proof.originalWidth,
    height: proof.originalHeight,
    capturedAt: proof.capturedAt,
    location: proof.location,
  });
  const originalBytes = await new File(proof.originalUri).arrayBuffer();
  const thumbnailBytes = await new File(proof.thumbnailUri).arrayBuffer();
  const thumbnailUpload = await mobileSupabase.storage
    .from("delivery-proof-images")
    .uploadToSignedUrl(intent.thumbnail.path, intent.thumbnail.token, thumbnailBytes, {
      contentType: "image/jpeg",
    });
  if (thumbnailUpload.error && !/already exists|duplicate/i.test(thumbnailUpload.error.message))
    throw thumbnailUpload.error;
  const originalUpload = await mobileSupabase.storage
    .from("delivery-proof-images")
    .uploadToSignedUrl(intent.original.path, intent.original.token, originalBytes, {
      contentType: "image/jpeg",
    });
  if (originalUpload.error && !/already exists|duplicate/i.test(originalUpload.error.message))
    throw originalUpload.error;
  const result = await completeDeliveryProofUpload(options, deliveryId, intent.imageId, {
    mimeType: "image/jpeg",
    byteSize: proof.originalByteSize,
    width: proof.originalWidth,
    height: proof.originalHeight,
  });
  for (const uri of [proof.originalUri, proof.thumbnailUri]) {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
  return result;
}
