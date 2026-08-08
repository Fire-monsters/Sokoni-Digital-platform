import type { ListingAvailability, VendorListing } from "@sokoni-digital/domain";
import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router, type Href } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import {
  flushAvailabilityQueue,
  useAvailabilityMutation,
  useVendorListings,
} from "@/features/listings/hooks";
import { useAccessToken } from "@/hooks/use-auth-session";

const groups = [
  ["changes_requested", "Needs attention"],
  ["pending_approval", "Pending approval"],
  ["active", "Active"],
  ["draft", "Drafts"],
  ["archived", "Archived"],
] as const;

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    return (value === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function ListingCard({ listing }: { listing: VendorListing }) {
  const availability = useAvailabilityMutation();
  const setAvailability = (next: ListingAvailability) =>
    availability.mutate({
      listingId: listing.id,
      availability: next,
      expectedVersion: listing.version,
      operationId: uuid(),
    });

  return (
    <Pressable onPress={() => router.push(`/listings/${listing.id}` as Href)} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardCopy}>
          <AppText variant="heading3">{listing.productName}</AppText>
          <AppText color="secondary">
            {listing.packageQuantity} {listing.packageUnit} · v{listing.version}
          </AppText>
        </View>
        <AppText variant="label" style={styles.price}>
          {listing.approvedPriceUgx
            ? `UGX ${listing.approvedPriceUgx.toLocaleString()}`
            : "Price pending"}
        </AppText>
      </View>
      {listing.status !== "archived" ? (
        <View style={styles.availabilityRow}>
          {(["available", "low_stock", "unavailable"] as const).map((value) => (
            <Pressable
              key={value}
              disabled={availability.isPending}
              onPress={() => setAvailability(value)}
              style={[
                styles.availabilityChip,
                listing.availability === value ? styles.selectedChip : null,
              ]}
            >
              <AppText variant="caption">{value.replace("_", " ")}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {availability.isError ? (
        <AppText variant="caption" style={styles.warning}>
          Saved for retry when the connection returns.
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function VendorListingsScreen() {
  const query = useVendorListings();
  const accessToken = useAccessToken();
  const refetch = query.refetch;

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (state.isConnected && accessToken) {
          void flushAvailabilityQueue(accessToken).then(() => refetch());
        }
      }),
    [accessToken, refetch],
  );

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="heading1">Your listings</AppText>
          <AppText color="secondary">Manage packages, approvals and stock from one place.</AppText>
        </View>
        <AppButton label="New" onPress={() => router.push("/listings/new" as Href)} />
      </View>

      {query.isPending ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      {query.isError && !query.data ? (
        <View style={styles.empty}>
          <AppText variant="heading3">Listings unavailable</AppText>
          <AppButton label="Try again" onPress={() => void query.refetch()} />
        </View>
      ) : null}
      {query.fetchStatus === "paused" ? (
        <View style={styles.offline}>
          <AppText variant="caption">Offline · showing saved listings</AppText>
        </View>
      ) : null}

      {groups.map(([status, title]) => {
        const items = query.data?.filter((listing) => listing.status === status) ?? [];
        if (items.length === 0) return null;
        return (
          <View key={status} style={styles.section}>
            <AppText variant="heading3">{title}</AppText>
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </View>
        );
      })}
      {query.data?.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="heading3">Create your first package</AppText>
          <AppText color="secondary">
            Add a product, price and photos, then submit it for review.
          </AppText>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.sm },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: "row", gap: spacing.sm },
  cardCopy: { flex: 1 },
  price: { color: colors.primary },
  availabilityRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  availabilityChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectedChip: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  warning: { color: colors.warning },
  offline: { backgroundColor: "#FFF2D8", borderRadius: 8, padding: spacing.sm },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
});
