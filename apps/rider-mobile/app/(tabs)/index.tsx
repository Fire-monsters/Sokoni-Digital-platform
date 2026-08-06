import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from '@sokoni-digital/ui';
import { StyleSheet, View } from 'react-native';

export default function RiderHomeScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Approved
          </AppText>
        </View>
        <AppText variant="heading1">Rider workspace</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Manage delivery work once administrator approval and trusted-device checks are complete.
        </AppText>
      </View>

      <View style={styles.sections}>
        <InfoCard title="Delivery offers" description="Eligible nearby delivery offers will appear here for acceptance." />
        <InfoCard title="Assigned trips" description="Accepted trips will show pickup, drop-off and status steps." />
        <InfoCard title="Proof of delivery" description="Delivery confirmation evidence will be captured before completion." />
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
