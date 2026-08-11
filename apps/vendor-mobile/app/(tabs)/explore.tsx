import type { VendorFulfilmentStatus, VendorOrderSummary } from "@sokoni-digital/domain";
import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router, type Href } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useVendorOrders } from "@/features/orders/hooks";

const sections: { status: VendorFulfilmentStatus; title: string }[] = [
  { status: "awaiting_vendor_acceptance", title: "New orders" },
  { status: "accepted", title: "Accepted" },
  { status: "preparing", title: "Preparing" },
  { status: "quality_verified", title: "Quality checked" },
  { status: "ready_for_pickup", title: "Ready" },
  { status: "issue_reported", title: "Needs attention" },
];

const statusLabels: Record<VendorFulfilmentStatus, string> = {
  awaiting_vendor_acceptance: "NEW",
  accepted: "ACCEPTED",
  preparing: "PREPARING",
  quality_verified: "QUALITY CHECKED",
  ready_for_pickup: "READY",
  cancelled: "CANCELLED",
  issue_reported: "NEEDS ATTENTION",
};

function OrderCard({ order }: { order: VendorOrderSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/orders/${order.id}` as Href)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <AppText variant="heading3">{order.reference}</AppText>
        <View style={styles.badge}>
          <AppText variant="caption" style={styles.badgeText}>
            {statusLabels[order.status]}
          </AppText>
        </View>
      </View>
      <AppText color="secondary">
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · UGX{" "}
        {order.subtotalUgx.toLocaleString()}
      </AppText>
      <AppText color="secondary" variant="caption">
        {order.fulfilment.type === "delivery" ? "Delivery" : "Market pickup"} · v{order.version}
      </AppText>
    </Pressable>
  );
}

export default function VendorOrdersScreen() {
  const query = useVendorOrders();
  const orders = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="heading1">Seller orders</AppText>
          <AppText color="secondary">Accept, pack, verify and hand off paid orders.</AppText>
        </View>
        <AppButton label="Refresh" variant="secondary" onPress={() => void query.refetch()} />
      </View>

      {query.isPending ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      {query.isError && orders.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="heading3">Orders unavailable</AppText>
          <AppText color="secondary">Check your connection and try again.</AppText>
        </View>
      ) : null}
      {query.fetchStatus === "paused" ? (
        <View style={styles.offline}>
          <AppText variant="caption">Offline · showing the last saved queue</AppText>
        </View>
      ) : null}

      {sections.map((section) => {
        const matching = orders.filter((order) => order.status === section.status);
        if (matching.length === 0) return null;
        return (
          <View key={section.status} style={styles.section}>
            <AppText variant="heading2">{section.title}</AppText>
            {matching.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </View>
        );
      })}

      {!query.isPending && !query.isError && orders.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="heading3">No seller orders yet</AppText>
          <AppText color="secondary">New paid orders will appear here.</AppText>
        </View>
      ) : null}
      {query.hasNextPage ? (
        <AppButton
          label="Load more orders"
          variant="secondary"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
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
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: {
    marginLeft: "auto",
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  badgeText: { color: colors.primaryDark },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  offline: { backgroundColor: "#FFF2D8", borderRadius: 8, padding: spacing.sm },
});
