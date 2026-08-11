import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import {
  AvailabilityBadge,
  CatalogueLoading,
  CatalogueMessage,
  StaleCatalogueNotice,
  formatUgx,
} from "@/features/catalogue/components";
import { useCatalogueListing } from "@/features/catalogue/hooks";
import { useCatalogueInterface } from "@/features/catalogue/catalogue-store";
import { useCartActions } from "@/features/cart/use-cart";

export default function ListingDetailsScreen() {
  const { listingId = "" } = useLocalSearchParams<{ listingId: string }>();
  const query = useCatalogueListing(listingId);
  const reducedData = useCatalogueInterface((state) => state.reducedData);
  const cart = useCartActions();

  if (query.isPending) {
    return (
      <AppScreen>
        <CatalogueLoading label="Loading package details…" />
      </AppScreen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppScreen>
        <CatalogueMessage
          title="Package unavailable"
          message="This listing may no longer be active, or the connection was interrupted."
          onRetry={() => void query.refetch()}
        />
      </AppScreen>
    );
  }

  const listing = query.data;

  return (
    <AppScreen scroll contentStyle={styles.content}>
      {query.fetchStatus === "paused" ? <StaleCatalogueNotice /> : null}
      {listing.images.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {listing.images.map((image) => (
            <Image
              key={image.id}
              accessibilityLabel={listing.productName}
              cachePolicy="memory-disk"
              contentFit="cover"
              placeholder={image.blurHash ? { blurhash: image.blurHash } : undefined}
              source={{ uri: reducedData ? (image.thumbnailUrl ?? image.url) : image.url }}
              style={styles.heroImage}
              transition={150}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.heroImage, styles.imageFallback]}>
          <AppText style={styles.fallbackGlyph}>🥬</AppText>
          <AppText color="secondary">Image not available</AppText>
        </View>
      )}

      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <AppText variant="heading1">{listing.productName}</AppText>
          <AppText color="secondary">
            {listing.packageQuantity} {listing.packageUnit}
          </AppText>
        </View>
        <AvailabilityBadge availability={listing.availability} />
      </View>

      <AppText style={styles.price} variant="heading2">
        {formatUgx(listing.approvedPriceUgx)}
      </AppText>

      <View style={styles.infoCard}>
        <AppText variant="label">Sold by {listing.vendorName}</AppText>
        <AppText color="secondary">
          {listing.market?.name ?? "Kitooro Market"} · Approved marketplace vendor
        </AppText>
      </View>

      <View style={styles.description}>
        <AppText variant="heading3">About this package</AppText>
        <AppText color="secondary">
          {listing.description ?? "The vendor has not added a description yet."}
        </AppText>
      </View>
      <AppButton
        disabled={listing.availability === "unavailable" || !listing.market}
        label={
          listing.availability === "unavailable" ? "Currently unavailable" : "Add package to cart"
        }
        onPress={() => {
          if (!listing.market) return;
          cart.add({
            listingId: listing.id,
            productName: listing.productName,
            packageLabel: `${listing.packageQuantity} ${listing.packageUnit}`,
            sellerId: listing.sellerId,
            sellerName: listing.vendorName,
            marketId: listing.market.id,
            unitPriceUgx: listing.approvedPriceUgx,
            thumbnailUrl: listing.images[0]?.thumbnailUrl ?? listing.images[0]?.url ?? null,
          });
          Alert.alert("Added to cart", `${listing.productName} is in your cart.`);
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  heroImage: {
    width: 340,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  fallbackGlyph: {
    fontSize: 64,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  titleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  price: {
    color: colors.primary,
  },
  infoCard: {
    gap: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  description: {
    gap: spacing.sm,
  },
});
