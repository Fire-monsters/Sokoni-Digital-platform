import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from '@sokoni-digital/ui';
import { StyleSheet, View } from 'react-native';

export default function VendorHomeScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Approved
          </AppText>
        </View>
        <AppText variant="heading1">Vendor workspace</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Manage stall activity once administrator approval and trusted-device checks are complete.
        </AppText>
      </View>

      <View style={styles.sections}>
        <InfoCard title="Orders" description="Incoming vendor orders will appear here for acceptance and packing." />
        <InfoCard title="Listings" description="Create, update and pause product listings from the approved vendor app." />
        <InfoCard title="Quality evidence" description="Packing and quality photographs will be captured before handoff." />
      </View>

      <View style={styles.actions}>
        <AppButton disabled label="Awaiting backend connection" />
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
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
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
