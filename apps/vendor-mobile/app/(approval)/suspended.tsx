import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function VendorSuspendedScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Suspended
          </AppText>
        </View>
        <AppText variant="heading1">Account suspended</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Vendor operations are temporarily disabled while E-Katale reviews this account.
        </AppText>
      </View>

      <View style={styles.sections}>
        <InfoCard
          title="Access paused"
          description="Orders, listings and profile changes remain locked until the suspension is resolved."
        />
        <InfoCard
          title="Reason recorded"
          description="Suspension actions must go through operations controls and audit records."
        />
        <InfoCard
          title="Wait for update"
          description="The operations team will contact you or update your account status after review."
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
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statusBadge: {
    alignSelf: "flex-start",
    minHeight: 28,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FFF4E4",
    paddingHorizontal: spacing.sm,
  },
  statusBadgeText: {
    color: colors.warning,
  },
  sections: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
