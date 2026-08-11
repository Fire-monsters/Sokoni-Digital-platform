import {
  completeQualityImageUpload,
  createQualityImageUploadIntent,
  type ApiClientOptions,
} from "@sokoni-digital/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { qualityImageCompressionContract } from "@sokoni-digital/domain";
import { PersistentOperationQueue } from "@sokoni-digital/offline-sync";
import { File } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { mobileSupabase } from "@/lib/supabase";
import { createOperationId } from "./uuid";

export interface PreparedQualityImage {
  operationId: string;
  originalUri: string;
  thumbnailUri: string;
  originalByteSize: number;
  thumbnailByteSize: number;
  originalWidth: number;
  originalHeight: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

interface QualityUploadPayload {
  orderId: string;
  image: PreparedQualityImage;
}

const qualityUploadQueue = new PersistentOperationQueue<QualityUploadPayload>(
  AsyncStorage,
  "sokoni-quality-upload-queue-v1",
);
let hydration: ReturnType<typeof qualityUploadQueue.hydrate> | undefined;
function ensureHydrated() {
  hydration ??= qualityUploadQueue.hydrate();
  return hydration;
}

async function prepareAsset(asset: ImagePicker.ImagePickerAsset): Promise<PreparedQualityImage> {
  const scale = Math.min(
    1,
    qualityImageCompressionContract.longEdge / Math.max(asset.width, asset.height),
  );
  const originalWidth = Math.max(1, Math.round(asset.width * scale));
  const originalHeight = Math.max(1, Math.round(asset.height * scale));
  const originalContext = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  originalContext.resize({ width: originalWidth, height: originalHeight });
  const originalRendered = await originalContext.renderAsync();
  const original = await originalRendered.saveAsync({
    compress: qualityImageCompressionContract.jpegQuality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const thumbnailScale =
    qualityImageCompressionContract.thumbnailEdge / Math.max(asset.width, asset.height);
  const thumbnailWidth = Math.max(1, Math.round(asset.width * thumbnailScale));
  const thumbnailHeight = Math.max(1, Math.round(asset.height * thumbnailScale));
  const thumbnailContext = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  thumbnailContext.resize({ width: thumbnailWidth, height: thumbnailHeight });
  const thumbnailRendered = await thumbnailContext.renderAsync();
  const thumbnail = await thumbnailRendered.saveAsync({
    compress: qualityImageCompressionContract.thumbnailJpegQuality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const originalFile = new File(original.uri);
  const thumbnailFile = new File(thumbnail.uri);
  if (
    originalFile.size > qualityImageCompressionContract.maxOriginalBytes ||
    thumbnailFile.size > qualityImageCompressionContract.maxThumbnailBytes
  ) {
    throw new Error("The compressed photo is still too large. Retake it in lower detail.");
  }
  return {
    operationId: createOperationId(),
    originalUri: original.uri,
    thumbnailUri: thumbnail.uri,
    originalByteSize: originalFile.size,
    thumbnailByteSize: thumbnailFile.size,
    originalWidth,
    originalHeight,
    thumbnailWidth,
    thumbnailHeight,
  };
}

export async function captureQualityImage(): Promise<PreparedQualityImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new Error("Camera permission is required to photograph the order.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    cameraType: ImagePicker.CameraType.back,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return prepareAsset(result.assets[0]);
}

export async function pickQualityImage(): Promise<PreparedQualityImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return prepareAsset(result.assets[0]);
}

export async function uploadQualityImage(
  options: ApiClientOptions,
  orderId: string,
  image: PreparedQualityImage,
) {
  const intent = await createQualityImageUploadIntent(options, orderId, {
    operationId: image.operationId,
    mimeType: "image/jpeg",
    byteSize: image.originalByteSize,
    width: image.originalWidth,
    height: image.originalHeight,
  });
  const originalBytes = await new File(image.originalUri).arrayBuffer();
  const thumbnailBytes = await new File(image.thumbnailUri).arrayBuffer();
  const thumbnailUpload = await mobileSupabase.storage
    .from("quality-check-images")
    .uploadToSignedUrl(intent.thumbnail.path, intent.thumbnail.token, thumbnailBytes, {
      contentType: "image/jpeg",
    });
  if (thumbnailUpload.error && !isDuplicateObjectError(thumbnailUpload.error)) {
    throw thumbnailUpload.error;
  }
  const originalUpload = await mobileSupabase.storage
    .from("quality-check-images")
    .uploadToSignedUrl(intent.original.path, intent.original.token, originalBytes, {
      contentType: "image/jpeg",
    });
  if (originalUpload.error && !isDuplicateObjectError(originalUpload.error)) {
    throw originalUpload.error;
  }
  return completeQualityImageUpload(options, orderId, intent.imageId, {
    original: {
      path: intent.original.path,
      mimeType: "image/jpeg",
      byteSize: image.originalByteSize,
      width: image.originalWidth,
      height: image.originalHeight,
    },
    thumbnail: {
      path: intent.thumbnail.path,
      mimeType: "image/jpeg",
      byteSize: image.thumbnailByteSize,
      width: image.thumbnailWidth,
      height: image.thumbnailHeight,
    },
  });
}

function isDuplicateObjectError(error: { message?: string }): boolean {
  return /already exists|duplicate/i.test(error.message ?? "");
}

export async function queueQualityImageUpload(orderId: string, image: PreparedQualityImage) {
  await ensureHydrated();
  return qualityUploadQueue.enqueue({
    id: image.operationId,
    kind: "quality-image-upload",
    payload: { orderId, image },
  });
}

export async function flushQualityImageUploads(options: ApiClientOptions) {
  await ensureHydrated();
  return qualityUploadQueue.flush((operation) =>
    uploadQualityImage(options, operation.payload.orderId, operation.payload.image).then(
      () => undefined,
    ),
  );
}
