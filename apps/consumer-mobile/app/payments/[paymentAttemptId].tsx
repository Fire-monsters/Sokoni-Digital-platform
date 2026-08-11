import { AppButton, AppScreen, AppText, spacing } from "@sokoni-digital/ui";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";

import { useConsumerAuth } from "@/features/auth/auth-provider";
import { useCartStore } from "@/features/cart/cart-store";
import { PaymentStatusCard, PaymentSummaryCard } from "@/features/payments/components";
import { fetchPayment, getPaymentPollInterval } from "@/features/payments/payment-api";
import { openPesapalPayment } from "@/features/payments/open-pesapal";
import { getPickupCode, removePickupCode } from "@/features/payments/pickup-code-store";
import { usePaymentRecoveryStore } from "@/features/payments/payment-store";

export default function PaymentStatusScreen() {
  const { paymentAttemptId, autoOpen } = useLocalSearchParams<{
    paymentAttemptId: string;
    autoOpen?: string;
  }>();
  const { session } = useConsumerAuth();
  const token = session?.access_token;
  const setActive = usePaymentRecoveryStore((state) => state.setActivePaymentAttemptId);
  const clearCart = useCartStore((state) => state.clearAfterCheckout);
  const openedAutomatically = useRef(false);
  const [browserError, setBrowserError] = useState("");
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["payment", paymentAttemptId],
    queryFn: () => fetchPayment(paymentAttemptId, token!),
    enabled: Boolean(token && paymentAttemptId),
    refetchInterval: (current) => getPaymentPollInterval(current.state.data),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const payment = query.data;
  const { refetch } = query;
  const redirectUrl = payment?.nextAction.type === "redirect" ? payment.nextAction.url : null;
  const openBrowser = useCallback(
    async (url: string) => {
      setBrowserError("");
      const result = await openPesapalPayment(url);
      if (result.outcome === "cancelled") {
        router.replace({ pathname: "/payments/cancelled", params: { paymentAttemptId } });
        return;
      }
      if (result.outcome === "error") {
        setBrowserError(
          "The secure payment window could not be opened. Your order was not marked paid.",
        );
      }
      await refetch();
    },
    [paymentAttemptId, refetch],
  );

  useEffect(() => {
    if (!payment) return;
    if (payment.status === "successful" || payment.provider === "market_pickup") {
      clearCart();
      setActive(null);
      if (payment.provider === "market_pickup") {
        if (payment.status === "successful") void removePickupCode(payment.checkoutId);
        else void getPickupCode(payment.checkoutId).then(setPickupCode);
      }
      return;
    }
    if (payment.status === "failed" || payment.status === "expired") {
      setActive(null);
      return;
    }
    setActive(payment.paymentAttemptId);
  }, [clearCart, payment, setActive]);
  useEffect(() => {
    if (autoOpen !== "true" || openedAutomatically.current || !redirectUrl) return;
    openedAutomatically.current = true;
    void openBrowser(redirectUrl);
  }, [autoOpen, openBrowser, redirectUrl]);

  if (query.isPending) {
    return (
      <AppScreen contentStyle={styles.center}>
        <ActivityIndicator />
        <AppText>Loading payment…</AppText>
      </AppScreen>
    );
  }
  if (query.isError || !payment) {
    return (
      <AppScreen contentStyle={styles.center}>
        <AppText variant="heading1">We couldn’t load this payment</AppText>
        <AppText color="secondary">
          Check your connection. Do not start another payment yet.
        </AppText>
        <AppButton label="Try again" onPress={() => void query.refetch()} />
      </AppScreen>
    );
  }

  return (
    <AppScreen contentStyle={styles.content}>
      <PaymentStatusCard status={payment.status} provider={payment.provider} />
      <PaymentSummaryCard
        amount={payment.amount}
        merchantReference={payment.merchantReference}
        paymentMethod={payment.paymentMethod}
      />
      {payment.provider === "market_pickup" && payment.status === "pending" && pickupCode ? (
        <AppText variant="heading2">Pickup code: {pickupCode}</AppText>
      ) : null}
      {query.fetchStatus === "paused" ? (
        <AppText style={styles.warning}>
          You are offline. We will resume checking when connected.
        </AppText>
      ) : null}
      {browserError ? <AppText style={styles.error}>{browserError}</AppText> : null}
      {redirectUrl && payment.status === "pending" ? (
        <AppButton
          label="Open secure Pesapal payment"
          onPress={() => void openBrowser(redirectUrl)}
        />
      ) : null}
      {(payment.status === "pending" || payment.status === "requires_reconciliation") &&
      payment.provider === "pesapal" ? (
        <AppButton
          label="I’ve paid — check again"
          variant="secondary"
          onPress={() => void query.refetch()}
        />
      ) : null}
      {payment.provider === "market_pickup" && payment.status === "pending" ? (
        <AppButton label="Continue shopping" onPress={() => router.replace("/(tabs)")} />
      ) : null}
      {payment.status === "successful" ? (
        <AppButton
          label="View my order"
          onPress={() =>
            router.replace({
              pathname: "/orders/[checkoutId]",
              params: { checkoutId: payment.checkoutId },
            })
          }
        />
      ) : null}
      {payment.status === "failed" || payment.status === "expired" ? (
        <AppButton label="Shop again" onPress={() => router.replace("/(tabs)")} />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  center: { flex: 1, gap: spacing.md, justifyContent: "center", alignItems: "center" },
  warning: { color: "#8A4B08" },
  error: { color: "#B42318" },
});
