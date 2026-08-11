import { AppButton, AppScreen, AppText, AppTextField, colors, spacing } from "@sokoni-digital/ui";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useConsumerAuth } from "@/features/auth/auth-provider";
import { useCartStore } from "@/features/cart/cart-store";
import {
  createAddress,
  createCheckout,
  fetchAddresses,
  fetchZones,
  type Address,
  type CheckoutView,
  type DeliveryZone,
} from "@/features/checkout/checkout-api";
import { formatUgx } from "@/features/catalogue/components";
import { initiatePayment } from "@/features/payments/payment-api";
import { PayerContactFields, PaymentProviderCard } from "@/features/payments/components";
import { savePickupCode } from "@/features/payments/pickup-code-store";
import { usePaymentRecoveryStore } from "@/features/payments/payment-store";

export default function CheckoutScreen() {
  const { session } = useConsumerAuth();
  const cart = useCartStore();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [type, setType] = useState<"delivery" | "market_pickup">("delivery");
  const [scheduled, setScheduled] = useState(false);
  const [summary, setSummary] = useState("");
  const [phone, setPhone] = useState("+256");
  const [email, setEmail] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"pesapal" | "market_pickup">("pesapal");
  const [result, setResult] = useState<CheckoutView | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [key] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [error, setError] = useState("");
  const marketId = cart.items[0]?.marketId ?? "";
  const validPayerPhone = /^\+[1-9][0-9]{7,14}$/.test(phone.trim());
  const validPayerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const setActivePayment = usePaymentRecoveryStore((state) => state.setActivePaymentAttemptId);
  const token = session?.access_token;
  useEffect(() => {
    if (!token || !marketId) return;
    void Promise.all([fetchZones(marketId, token), fetchAddresses(token)]).then(
      ([nextZones, nextAddresses]) => {
        setZones(nextZones);
        setAddresses(nextAddresses);
        setZoneId(nextZones[0]?.id ?? "");
        setAddressId(nextAddresses[0]?.id ?? "");
        setPhone(nextAddresses[0]?.phoneNumber ?? "+256");
      },
    );
  }, [marketId, token]);
  useEffect(() => {
    if (!result) return;
    if (!result.reservation.expiresAt) {
      setRemaining(0);
      return;
    }
    const expiresAt = result.reservation.expiresAt;
    const update = () =>
      setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [result]);
  const grouped = useMemo(
    () => Object.entries(Object.groupBy(cart.items, (item) => item.sellerName)),
    [cart.items],
  );
  if (result)
    return (
      <AppScreen contentStyle={styles.content}>
        <AppText variant="heading1">Order reserved</AppText>
        <AppText>{result.reference}</AppText>
        <View style={styles.notice}>
          <AppText variant="heading2">
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")}
          </AppText>
          <AppText>Complete payment soon to keep your items reserved.</AppText>
        </View>
        {result.pickupCode ? (
          <AppText variant="heading2">Pickup code: {result.pickupCode}</AppText>
        ) : null}
        <AppText variant="heading2">{formatUgx(result.pricing.total)}</AppText>
        <PaymentProviderCard
          allowPayAtPickup={result.fulfilment.type === "market_pickup"}
          selected={paymentProvider}
          onSelect={setPaymentProvider}
        />
        {paymentProvider === "pesapal" ? (
          <View style={styles.card}>
            <PayerContactFields
              phone={phone}
              email={email}
              onPhoneChange={setPhone}
              onEmailChange={setEmail}
            />
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <AppButton
              label="Continue to secure payment"
              loading={paymentBusy}
              disabled={!validPayerPhone && !validPayerEmail}
              onPress={() => void pay(result)}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <AppText color="secondary">
              No online payment is required now. Your pickup code will be checked before payment is
              recorded at the market.
            </AppText>
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <AppButton
              label="Confirm pay at pickup"
              loading={paymentBusy}
              onPress={() => void pay(result)}
            />
          </View>
        )}
      </AppScreen>
    );
  async function pay(checkout: CheckoutView) {
    if (!token) return;
    setPaymentBusy(true);
    setError("");
    try {
      const payment = await initiatePayment(
        checkout.id,
        token,
        Crypto.randomUUID(),
        paymentProvider === "market_pickup"
          ? { provider: "market_pickup" }
          : {
              provider: "pesapal",
              ...(validPayerPhone ? { payerPhone: phone.trim() } : {}),
              ...(validPayerEmail ? { payerEmail: email.trim() } : {}),
            },
      );
      setActivePayment(payment.provider === "pesapal" ? payment.paymentAttemptId : null);
      if (payment.provider === "market_pickup") cart.clearAfterCheckout();
      router.push({
        pathname: "/payments/[paymentAttemptId]",
        params: {
          paymentAttemptId: payment.paymentAttemptId,
          ...(payment.provider === "pesapal" ? { autoOpen: "true" } : {}),
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be started.");
    } finally {
      setPaymentBusy(false);
    }
  }
  async function confirm() {
    if (!token || !cart.backendCartId) return;
    setBusy(true);
    setError("");
    try {
      let selectedAddress = addressId;
      if (!selectedAddress) {
        const created = await createAddress(token, { label: "Home", summary, phoneNumber: phone });
        selectedAddress = created.id;
        setAddressId(created.id);
      }
      const schedule = scheduled
        ? { type: "scheduled", requestedFor: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
        : { type: "immediate" };
      const fulfilment =
        type === "delivery"
          ? { type, deliveryZoneId: zoneId, addressId: selectedAddress, schedule }
          : { type, marketId, addressId: selectedAddress, schedule };
      const checkout = await createCheckout(token, key, {
        cartId: cart.backendCartId,
        fulfilment,
      });
      if (checkout.pickupCode) await savePickupCode(checkout.id, checkout.pickupCode);
      setResult(checkout);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">Review checkout</AppText>
      {grouped.map(([seller, items]) => (
        <View key={seller} style={styles.card}>
          <AppText variant="heading3">{seller}</AppText>
          {items?.map((item) => (
            <AppText key={item.listingId}>
              {item.productName} {item.packageLabel} × {item.quantity}
            </AppText>
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {(["delivery", "market_pickup"] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              setType(option);
              if (option === "delivery") setPaymentProvider("pesapal");
            }}
            style={[styles.option, type === option && styles.selected]}
          >
            <AppText variant="label">
              {option === "delivery" ? "Delivery" : "Market pickup"}
            </AppText>
          </Pressable>
        ))}
      </View>
      {addresses.length === 0 ? (
        <>
          <AppTextField
            label="Delivery or contact address"
            value={summary}
            onChangeText={setSummary}
          />
          <AppTextField
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </>
      ) : (
        addresses.map((address) => (
          <Pressable
            key={address.id}
            style={[styles.option, addressId === address.id && styles.selected]}
            onPress={() => setAddressId(address.id)}
          >
            <AppText variant="label">{address.label}</AppText>
            <AppText color="secondary">{address.summary}</AppText>
          </Pressable>
        ))
      )}
      {type === "delivery"
        ? zones.map((zone) => (
            <Pressable
              key={zone.id}
              style={[styles.option, zoneId === zone.id && styles.selected]}
              onPress={() => setZoneId(zone.id)}
            >
              <AppText variant="label">{zone.name}</AppText>
              <AppText>{formatUgx(zone.deliveryFeeUgx)}</AppText>
            </Pressable>
          ))
        : null}
      <Pressable style={styles.option} onPress={() => setScheduled((value) => !value)}>
        <AppText>{scheduled ? "Scheduled: one hour from now" : "As soon as possible"}</AppText>
      </Pressable>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      <AppButton
        label="Confirm and reserve"
        loading={busy}
        disabled={
          (!addressId && (!summary || phone.length < 13)) || (type === "delivery" && !zoneId)
        }
        onPress={() => void confirm()}
      />
    </AppScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  option: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  notice: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: "#FFF2D8",
    alignItems: "center",
  },
  error: { color: "#B42318" },
});
