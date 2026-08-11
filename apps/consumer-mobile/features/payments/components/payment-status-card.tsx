import { AppText, colors, spacing } from "@sokoni-digital/ui";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { PaymentStatus } from "../payment-api";

export function PaymentStatusCard({
  status,
  provider,
}: {
  status: PaymentStatus;
  provider: "pesapal" | "market_pickup";
}) {
  const copy = statusCopy(status, provider);
  return (
    <View
      style={[styles.card, { backgroundColor: copy.background }]}
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.message}`}
    >
      {copy.spinner ? <ActivityIndicator /> : null}
      <AppText variant="heading1">{copy.title}</AppText>
      <AppText>{copy.message}</AppText>
    </View>
  );
}

function statusCopy(status: PaymentStatus, provider: "pesapal" | "market_pickup") {
  if (provider === "market_pickup" && status === "pending")
    return {
      title: "Pay at pickup",
      message:
        "Your order is confirmed and the items are allocated. Bring your six-digit pickup code and pay at the market collection point.",
      background: colors.primaryLight,
      spinner: false,
    };
  if (status === "successful")
    return {
      title: "Payment confirmed",
      message: "Your items are secured and the vendors can prepare your order.",
      background: "#E8F5E9",
      spinner: false,
    };
  if (status === "failed")
    return {
      title: "Payment failed",
      message:
        "Pesapal confirmed that the payment did not complete. You have not been charged by E-Katale.",
      background: "#FDECEC",
      spinner: false,
    };
  if (status === "expired")
    return {
      title: "Payment expired",
      message:
        "The payment window ended before confirmation. Add the items again so availability and prices can be checked afresh.",
      background: "#FDECEC",
      spinner: false,
    };
  if (status === "requires_reconciliation")
    return {
      title: "Still verifying",
      message:
        "The result is not yet clear. Please do not pay again while we check directly with Pesapal.",
      background: "#FFF2D8",
      spinner: true,
    };
  return {
    title: "Waiting for payment",
    message:
      "Choose MTN MoMo, Airtel Money, or card in the secure Pesapal window. You can safely return here while we confirm.",
    background: colors.primaryLight,
    spinner: true,
  };
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: 16 },
});
