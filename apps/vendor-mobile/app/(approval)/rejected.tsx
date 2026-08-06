import { AppButton, AppScreen, AppText, InfoCard, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function VendorRejectedScreen() {
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.statusBadge}>
          <AppText style={styles.statusBadgeText} variant="caption">
            Rejected
          </AppText>
        </View>
        <AppText variant="heading1">Application rejected</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Your vendor application was not approved. The review reason will appear here when connected to the API.
        </AppText>
      </View>

      <View style={styles.sections}>
        <InfoCard
          title="Reason required"
          description="Administrators must provide a reason when rejecting a vendor application."
        />
        <InfoCard
          title="Operational access locked"
          description="Vendor orders, listings and stall tools remain unavailable for rejected accounts."
        />
        <InfoCard
          title="Next steps"
          description="Contact E-Katale operations if you believe this decision needs a controlled review."
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
    backgroundColor: '#FBEAEA',
    paddingHorizontal: spacing.sm,
  },
  statusBadgeText: {
    color: colors.error,
  },
  sections: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
