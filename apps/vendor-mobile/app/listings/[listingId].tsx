import { AppButton, AppScreen, AppText, AppTextField, colors, spacing } from "@sokoni-digital/ui";
import { Image } from "expo-image";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import {
  pickAndPrepareImage,
  queuePreparedImage,
  retryQueuedImages,
  uploadPreparedImage,
} from "@/features/listings/image-upload";
import {
  useArchiveVendorListing,
  usePriceRequest,
  useSubmitVendorListing,
  useVendorApiOptions,
  useVendorListing,
} from "@/features/listings/hooks";

export default function VendorListingDetailsScreen() {
  const { listingId = "" } = useLocalSearchParams<{ listingId: string }>();
  const query = useVendorListing(listingId);
  const submit = useSubmitVendorListing(listingId);
  const archive = useArchiveVendorListing(listingId);
  const priceRequest = usePriceRequest(listingId);
  const { options } = useVendorApiOptions();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [newPrice, setNewPrice] = useState("");

  const addImage = async () => {
    setUploadError(undefined);
    const prepared = await pickAndPrepareImage();
    if (!prepared) return;
    setUploading(true);
    try {
      await uploadPreparedImage(options, listingId, prepared);
      await query.refetch();
    } catch (error) {
      await queuePreparedImage(listingId, prepared);
      setUploadError(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (query.isPending)
    return (
      <AppScreen>
        <ActivityIndicator color={colors.primary} />
      </AppScreen>
    );
  if (!query.data)
    return (
      <AppScreen>
        <AppText>Listing unavailable.</AppText>
      </AppScreen>
    );
  const listing = query.data;
  const editable = listing.status === "draft" || listing.status === "changes_requested";

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="heading1">{listing.productName}</AppText>
        <AppText color="secondary">
          {listing.status.replaceAll("_", " ")} · {listing.packageQuantity} {listing.packageUnit}
        </AppText>
      </View>

      {listing.status !== "archived" &&
      listing.status !== "pending_approval" &&
      listing.latestPriceRequest?.status !== "pending" ? (
        <View style={styles.card}>
          <AppText variant="heading3">Request a new price</AppText>
          <AppTextField
            label="Proposed price in UGX"
            keyboardType="number-pad"
            value={newPrice}
            onChangeText={setNewPrice}
          />
          <AppButton
            label="Send price for approval"
            loading={priceRequest.isPending}
            onPress={() => {
              const proposedPriceUgx = Number(newPrice);
              if (Number.isInteger(proposedPriceUgx) && proposedPriceUgx > 0) {
                priceRequest.mutate({ proposedPriceUgx });
              }
            }}
          />
        </View>
      ) : null}

      <View style={styles.images}>
        {listing.images.map((image) => (
          <Image
            key={image.id}
            source={{ uri: image.thumbnailUrl ?? image.url }}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={styles.image}
          />
        ))}
      </View>
      {editable && listing.images.length < 4 ? (
        <AppButton
          label={uploading ? "Compressing and uploading…" : "Add compressed image"}
          disabled={uploading}
          onPress={() => void addImage()}
          variant="secondary"
        />
      ) : null}
      {uploadError ? <AppText style={styles.error}>{uploadError}</AppText> : null}
      {uploadError ? (
        <AppButton
          label="Retry queued uploads"
          onPress={() =>
            void retryQueuedImages(options).then(() => {
              setUploadError(undefined);
              void query.refetch();
            })
          }
          variant="secondary"
        />
      ) : null}

      <View style={styles.card}>
        <AppText variant="heading3">Price approval</AppText>
        <AppText>
          Proposed: UGX {listing.latestPriceRequest?.proposedPriceUgx.toLocaleString() ?? "—"}
        </AppText>
        <AppText color="secondary">
          Approved:{" "}
          {listing.approvedPriceUgx
            ? `UGX ${listing.approvedPriceUgx.toLocaleString()}`
            : "Waiting for review"}
        </AppText>
        {listing.latestPriceRequest?.reviewNote ? (
          <AppText style={styles.error}>{listing.latestPriceRequest.reviewNote}</AppText>
        ) : null}
      </View>

      {editable ? (
        <View style={styles.actions}>
          <AppButton
            label="Edit package"
            onPress={() => router.push(`/listings/edit/${listingId}` as Href)}
            variant="secondary"
          />
          <AppButton
            label="Submit for approval"
            loading={submit.isPending}
            disabled={
              listing.images.length === 0 || listing.latestPriceRequest?.status !== "pending"
            }
            onPress={() => submit.mutate()}
          />
        </View>
      ) : null}
      {submit.isError ? <AppText style={styles.error}>{submit.error.message}</AppText> : null}
      {listing.status !== "archived" ? (
        <AppButton
          label="Archive listing"
          variant="ghost"
          loading={archive.isPending}
          onPress={() =>
            Alert.alert("Archive listing?", "It will disappear from the public catalogue.", [
              { text: "Cancel", style: "cancel" },
              { text: "Archive", style: "destructive", onPress: () => archive.mutate() },
            ])
          }
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { gap: spacing.xs },
  images: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  image: { width: 140, height: 140, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  error: { color: colors.error },
  actions: { gap: spacing.sm },
});
