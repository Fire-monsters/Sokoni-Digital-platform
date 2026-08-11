import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function PaymentReturnErrorScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const invalidReturn = reason === "invalid_return" || reason === "invalid_cancel";

  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.icon}>
        <AppText variant="heading1">!</AppText>
      </View>
      <AppText variant="heading1">We couldn’t match this payment</AppText>
      <AppText color="secondary">
        {invalidReturn
          ? "The return link was incomplete. Your payment has not been marked successful."
          : "We could not verify the return from Pesapal. Please do not make another payment until its status is checked."}
      </AppText>
      <AppButton label="Back to market" onPress={() => router.replace("/(tabs)")} />
      <AppText color="secondary">
        If money left your account, contact support with the Pesapal confirmation message.
      </AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, justifyContent: "center" },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
});
