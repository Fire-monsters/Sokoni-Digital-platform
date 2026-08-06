import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function VendorPendingApprovalScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Submitted
          </AppText>
        </View>
        <AppText variant="heading1">Pending approval</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Your vendor application has been sent to the E-Katale operations team for review.
        </AppText>
      </View>

      <View style={styles.timeline}>
        <InfoCard
          title="Application received"
          description="Your identity, stall details and verification documents are queued for administrator review."
        />
        <InfoCard
          title="Review in progress"
          description="An administrator may approve your stall, request changes, or reject the application with a reason."
        />
        <InfoCard
          title="Access after approval"
          description="Operational vendor features stay locked until your account is approved."
        />
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Go to sign in"
          onPress={() => {
            router.replace('../(public)/sign-in');
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
  timeline: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
