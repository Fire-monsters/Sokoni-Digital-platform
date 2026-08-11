import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function PaymentCancelledScreen() {
  const { paymentAttemptId } = useLocalSearchParams<{ paymentAttemptId?: string }>();
  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.icon}>
        <AppText variant="heading1">×</AppText>
      </View>
      <AppText variant="heading1">Payment window closed</AppText>
      <AppText color="secondary">
        No payment has been assumed cancelled. We will check Pesapal before allowing another
        attempt, which protects you from being charged twice.
      </AppText>
      {paymentAttemptId ? (
        <AppButton
          label="Check payment status"
          onPress={() =>
            router.replace({
              pathname: "/payments/[paymentAttemptId]",
              params: { paymentAttemptId },
            })
          }
        />
      ) : null}
      <AppButton
        label="Back to market"
        variant="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
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
