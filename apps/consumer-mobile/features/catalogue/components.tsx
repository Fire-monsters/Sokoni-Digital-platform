import type { CatalogueListingCard, ListingAvailability } from "@sokoni-digital/domain";
import { AppButton, AppText, colors, spacing } from "@sokoni-digital/ui";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

export function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

const availabilityLabels: Record<ListingAvailability, string> = {
  available: "Available",
  low_stock: "Low stock",
  unavailable: "Unavailable",
};

export function AvailabilityBadge({ availability }: { availability: ListingAvailability }) {
  return (
    <View
      style={[
        styles.badge,
        availability === "unavailable"
          ? styles.badgeUnavailable
          : availability === "low_stock"
            ? styles.badgeLowStock
            : styles.badgeAvailable,
      ]}
    >
      <AppText variant="caption" style={styles.badgeText}>
        {availabilityLabels[availability]}
      </AppText>
    </View>
  );
}

export function ProductCard({
  item,
  compact = false,
}: {
  item: CatalogueListingCard;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${item.productName}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/listings/[listingId]", params: { listingId: item.id } })
      }
      style={[styles.card, compact ? styles.compactCard : null]}
    >
      {item.thumbnailUrl ? (
        <Image
          accessibilityLabel={item.productName}
          cachePolicy="memory-disk"
          contentFit="cover"
          placeholder={item.blurHash ? { blurhash: item.blurHash } : undefined}
          source={{ uri: item.thumbnailUrl }}
          style={styles.image}
          transition={150}
        />
      ) : (
        <View style={[styles.image, styles.imageFallback]}>
          <AppText style={styles.fallbackGlyph}>🥬</AppText>
        </View>
      )}
      <View style={styles.cardBody}>
        <AvailabilityBadge availability={item.availability} />
        <AppText numberOfLines={2} variant="heading3" style={styles.cardTitle}>
          {item.productName}
        </AppText>
        <AppText color="secondary" variant="caption">
          {item.packageQuantity} {item.packageUnit} · {item.vendorName}
        </AppText>
        <AppText style={styles.price} variant="label">
          {formatUgx(item.approvedPriceUgx)}
        </AppText>
      </View>
    </Pressable>
  );
}

export function CatalogueLoading({ label = "Loading the market…" }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText color="secondary">{label}</AppText>
    </View>
  );
}

export function CatalogueMessage({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      <AppText align="center" variant="heading3">
        {title}
      </AppText>
      <AppText align="center" color="secondary">
        {message}
      </AppText>
      {onRetry ? <AppButton label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function StaleCatalogueNotice() {
  return (
    <View style={styles.staleNotice}>
      <AppText variant="caption" color="secondary">
        Showing saved results. Prices and availability may have changed.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  compactCard: {
    width: 220,
    flex: 0,
  },
  image: {
    width: "100%",
    aspectRatio: 1.35,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackGlyph: {
    fontSize: 38,
  },
  cardBody: {
    alignItems: "flex-start",
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  price: {
    marginTop: spacing.xxs,
    color: colors.primary,
    fontWeight: "700",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeAvailable: {
    backgroundColor: colors.primaryLight,
  },
  badgeLowStock: {
    backgroundColor: "#FFF2D8",
  },
  badgeUnavailable: {
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: {
    fontWeight: "600",
  },
  state: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  staleNotice: {
    borderRadius: 8,
    backgroundColor: "#FFF2D8",
    padding: spacing.sm,
  },
});
