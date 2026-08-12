import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

const reviewSections = [
  {
    title: "Account",
    description:
      "Phone number, OTP verification, password and preferred language are ready for submission.",
  },
  {
    title: "Personal details",
    description:
      "Full name, National ID number, profile photograph and National ID images are included.",
  },
  {
    title: "Stall details",
    description:
      "Business name, Kitooro stall number, product categories and market identification are included.",
  },
  {
    title: "Verification",
    description:
      "Market leadership approval, stall photograph and vendor terms confirmations are included.",
  },
];

export default function VendorReviewScreen() {
  function submitApplication() {
    router.replace("../(approval)/pending");
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Review application</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Check the vendor registration sections before sending them for administrator approval.
        </AppText>
      </View>

      <View style={styles.sections}>
        {reviewSections.map((section) => (
          <InfoCard
            aside={
              <View style={styles.statusPill}>
                <AppText style={styles.statusPillText} variant="caption">
                  Ready
                </AppText>
              </View>
            }
            description={section.description}
            key={section.title}
            title={section.title}
          />
        ))}
      </View>

      <View style={styles.notice}>
        <AppText color="secondary" variant="caption">
          After submission, identity and role details can only be changed through a controlled
          correction workflow.
        </AppText>
      </View>

      <View style={styles.actions}>
        <AppButton label="Submit application" onPress={submitApplication} />
        <AppButton
          label="Back"
          onPress={() => {
            router.back();
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
  sections: {
    gap: spacing.sm,
  },
  statusPill: {
    minHeight: 28,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
  },
  statusPillText: {
    color: colors.primary,
  },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    marginTop: spacing.lg,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
