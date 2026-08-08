import {
  completeListingUpload,
  createListingUploadIntent,
  type ApiClientOptions,
} from "@sokoni-digital/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PersistentOperationQueue } from "@sokoni-digital/offline-sync";
import { File } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { mobileSupabase } from "@/lib/supabase";

export interface PreparedImage {
  localId: string;
  originalUri: string;
  thumbnailUri: string;
  originalByteSize: number;
  thumbnailByteSize: number;
  originalWidth: number;
  originalHeight: number;
}

const uploadQueue = new PersistentOperationQueue<PreparedImage & { listingId: string }>(
  AsyncStorage,
  "sokoni-listing-upload-queue-v1",
);
let uploadQueueHydration: ReturnType<typeof uploadQueue.hydrate> | undefined;

function ensureUploadQueueHydrated() {
  uploadQueueHydration ??= uploadQueue.hydrate();
  return uploadQueueHydration;
}

export async function queuePreparedImage(listingId: string, image: PreparedImage) {
  await ensureUploadQueueHydrated();
  return uploadQueue.enqueue({
    id: image.localId,
    kind: "listing-image",
    payload: { ...image, listingId },
  });
}

export async function retryQueuedImages(options: ApiClientOptions) {
  await ensureUploadQueueHydrated();
  return uploadQueue.flush((operation) =>
    uploadPreparedImage(options, operation.payload.listingId, operation.payload).then(
      () => undefined,
    ),
  );
}

export async function pickAndPrepareImage(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const scale = Math.min(1, 1280 / Math.max(asset.width, asset.height));
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));
  const originalContext = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  originalContext.resize({ width, height });
  const originalRendered = await originalContext.renderAsync();
  const original = await originalRendered.saveAsync({
    compress: 0.72,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const square = Math.min(asset.width, asset.height);
  const thumbnailContext = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  thumbnailContext
    .crop({
      originX: Math.round((asset.width - square) / 2),
      originY: Math.round((asset.height - square) / 2),
      width: square,
      height: square,
    })
    .resize({ width: 320, height: 320 });
  const thumbnailRendered = await thumbnailContext.renderAsync();
  const thumbnail = await thumbnailRendered.saveAsync({
    compress: 0.65,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const originalFile = new File(original.uri);
  const thumbnailFile = new File(thumbnail.uri);
  if (originalFile.size > 500_000 || thumbnailFile.size > 75_000) {
    throw new Error("The compressed image is still too large. Choose a smaller photo.");
  }
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    originalUri: original.uri,
    thumbnailUri: thumbnail.uri,
    originalByteSize: originalFile.size,
    thumbnailByteSize: thumbnailFile.size,
    originalWidth: width,
    originalHeight: height,
  };
}

export async function uploadPreparedImage(
  options: ApiClientOptions,
  listingId: string,
  image: PreparedImage,
) {
  const intent = await createListingUploadIntent(options, listingId, {
    mimeType: "image/jpeg",
    byteSize: image.originalByteSize,
    width: image.originalWidth,
    height: image.originalHeight,
  });
  const originalBytes = await new File(image.originalUri).arrayBuffer();
  const thumbnailBytes = await new File(image.thumbnailUri).arrayBuffer();
  const thumbnailUpload = await mobileSupabase.storage
    .from("listing-images")
    .uploadToSignedUrl(intent.thumbnail.path, intent.thumbnail.token, thumbnailBytes, {
      contentType: "image/jpeg",
    });
  if (thumbnailUpload.error) throw thumbnailUpload.error;
  const originalUpload = await mobileSupabase.storage
    .from("listing-images")
    .uploadToSignedUrl(intent.original.path, intent.original.token, originalBytes, {
      contentType: "image/jpeg",
    });
  if (originalUpload.error) throw originalUpload.error;

  return completeListingUpload(options, listingId, intent.imageId, {
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
      width: 320,
      height: 320,
    },
    blurHash: null,
  });
}
