import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function VendorPasswordResetSuccessScreen() {
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber?: string }>();

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Password updated
          </AppText>
        </View>
        <View style={styles.copy}>
          <AppText variant="heading1">You can sign in now</AppText>
          <AppText color="secondary" variant="bodyLarge">
            The vendor password for {phoneNumber ?? "your account"} has been reset.
          </AppText>
        </View>
        <InfoCard
          title="Trusted-device check"
          description="A new or unapproved device may still require OTP verification before operational access."
        />
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Go to sign in"
          onPress={() => {
            router.replace("../(public)/sign-in");
          }}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.lg,
  },
  statusBadge: {
    alignSelf: "flex-start",
    minHeight: 28,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
  },
  statusBadgeText: {
    color: colors.primary,
  },
  copy: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
