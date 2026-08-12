import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function VendorChangesRequestedScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Changes requested
          </AppText>
        </View>
        <AppText variant="heading1">Update your application</AppText>
        <AppText color="secondary" variant="bodyLarge">
          The operations team needs a few changes before your stall can be approved.
        </AppText>
      </View>

      <View style={styles.sections}>
        <InfoCard
          title="Review the request"
          description="Check the administrator notes and update only the requested stall or verification details."
        />
        <InfoCard
          title="Keep identity controlled"
          description="Submitted identity details stay locked unless the correction is part of the administrator request."
        />
        <InfoCard
          title="Resubmit for review"
          description="After updates, send the application back to the pending approval queue."
        />
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Review application"
          onPress={() => {
            router.replace("../(registration)/review");
          }}
        />
        <AppButton
          label="Go to sign in"
          onPress={() => {
            router.replace("../(public)/sign-in");
          }}
          variant="ghost"
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
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
  },
  statusBadgeText: {
    color: colors.primary,
  },
  sections: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
