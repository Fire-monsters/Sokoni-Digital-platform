import { AppButton, AppScreen, AppText, AppTextField, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { useConsumerAuth } from "@/features/auth/auth-provider";
import { deleteGuestCredentials, mergeGuestCart } from "@/features/cart/cart-api";
import { useCartStore } from "@/features/cart/cart-store";

export default function SignInScreen() {
  const auth = useConsumerAuth();
  const cart = useCartStore();
  const [phone, setPhone] = useState("+256");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!auth.session || busy) return;
    const accessToken = auth.session.access_token;
    setBusy(true);
    void (async () => {
      try {
        if (cart.backendCartId) {
          const result = await mergeGuestCart(cart.backendCartId, accessToken);
          cart.replaceFromServer(
            result.cart,
            result.adjustments.map((item) => item.message),
          );
          await deleteGuestCredentials();
        }
        router.replace(cart.items.length > 0 ? "/checkout" : "/");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Cart merge failed. Your guest cart is safe.",
        );
        setBusy(false);
      }
    })();
  }, [auth.session, busy, cart]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppScreen contentStyle={styles.content}>
      <AppText variant="heading1">Sign in to checkout</AppText>
      <AppText color="secondary">
        Your guest cart stays on this device until it merges successfully.
      </AppText>
      <AppButton
        label="Continue with Google"
        loading={busy}
        onPress={() => void action(auth.signInWithGoogle)}
      />
      <AppText align="center" color="secondary">
        or use your phone
      </AppText>
      <AppTextField
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        disabled={sent}
      />
      {sent ? (
        <AppTextField
          label="6-digit code"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
        />
      ) : null}
      <AppButton
        variant="secondary"
        loading={busy}
        label={sent ? "Verify code" : "Send SMS code"}
        onPress={() =>
          void action(async () => {
            if (sent) await auth.verifyPhoneOtp(phone, otp);
            else {
              await auth.sendPhoneOtp(phone);
              setSent(true);
            }
          })
        }
      />
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
    </AppScreen>
  );
}
const styles = StyleSheet.create({
  content: { justifyContent: "center", gap: spacing.md },
  error: { color: "#B42318" },
});
