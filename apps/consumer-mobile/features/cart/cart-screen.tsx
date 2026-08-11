import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { formatUgx } from "@/features/catalogue/components";
import { useCartActions } from "@/features/cart/use-cart";
import { useConsumerAuth } from "@/features/auth/auth-provider";

export default function CartScreen() {
  const cart = useCartActions();
  const auth = useConsumerAuth();
  const groups = Object.entries(Object.groupBy(cart.items, (item) => item.sellerName));
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPriceUgx * item.quantity, 0);
  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">Your cart</AppText>
      {cart.syncStatus === "failed" ? (
        <View style={styles.warning}>
          <AppText>Offline changes are saved. Stock will be checked at checkout.</AppText>
          <AppButton label="Retry sync" variant="secondary" onPress={() => void cart.retrySync()} />
        </View>
      ) : null}
      {cart.adjustments.map((message) => (
        <View key={message} style={styles.warning}>
          <AppText>{message}</AppText>
        </View>
      ))}
      {groups.map(([seller, items]) => (
        <View key={seller} style={styles.group}>
          <AppText variant="heading3">{seller}</AppText>
          {items?.map((item) => (
            <View key={item.listingId} style={styles.item}>
              <View style={styles.copy}>
                <AppText variant="label">{item.productName}</AppText>
                <AppText color="secondary">
                  {item.packageLabel} · {formatUgx(item.unitPriceUgx)}
                </AppText>
                {item.pending ? (
                  <AppText variant="caption" color="secondary">
                    Waiting to sync…
                  </AppText>
                ) : null}
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => cart.changeQuantity(item.listingId, item.quantity - 1)}>
                  <AppText variant="heading3">−</AppText>
                </Pressable>
                <AppText>{item.quantity}</AppText>
                <Pressable onPress={() => cart.changeQuantity(item.listingId, item.quantity + 1)}>
                  <AppText variant="heading3">+</AppText>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ))}
      {cart.items.length === 0 ? (
        <AppText color="secondary">Your cart is empty.</AppText>
      ) : (
        <>
          <View style={styles.total}>
            <AppText variant="label">Items subtotal</AppText>
            <AppText variant="heading3">{formatUgx(subtotal)}</AppText>
          </View>
          <AppText variant="caption" color="secondary">
            Items are not reserved until checkout is confirmed.
          </AppText>
          <AppButton
            disabled={cart.syncStatus === "syncing" || !cart.backendCartId}
            label={auth.session ? "Continue to checkout" : "Sign in to checkout"}
            onPress={() => router.push(auth.session ? "/checkout" : "/sign-in")}
          />
        </>
      )}
    </AppScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  warning: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: "#FFF2D8" },
  group: { gap: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  copy: { flex: 1, gap: spacing.xxs },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  total: { flexDirection: "row", justifyContent: "space-between" },
});
