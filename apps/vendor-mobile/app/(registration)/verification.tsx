import { parseVendorVerificationDetails } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, UploadCard, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

export default function VendorVerificationScreen() {
  const [hasMarketLeadershipApproval, setHasMarketLeadershipApproval] = useState(false);
  const [hasAcceptedPlatformTerms, setHasAcceptedPlatformTerms] = useState(false);
  const [hasAcceptedCommissionTerms, setHasAcceptedCommissionTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    hasMarketLeadershipApproval?: string;
    hasAcceptedPlatformTerms?: string;
    hasAcceptedCommissionTerms?: string;
  }>({});

  function continueToReview() {
    const result = parseVendorVerificationDetails({
      hasMarketLeadershipApproval,
      hasAcceptedPlatformTerms,
      hasAcceptedCommissionTerms,
    });

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    router.push('./review');
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Verification</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Add the approval and stall evidence needed before an administrator reviews your application.
        </AppText>
      </View>

      <View style={styles.form}>
        <UploadCard
          title="Market leadership approval"
          description="Upload an approval letter, stamp, or signed confirmation from market leadership."
          onPress={() => {
            Alert.alert('Upload approval', 'Private verification upload will be connected in the document upload slice.');
          }}
        />
        <UploadCard
          title="Stall photograph"
          description="Upload a clear photo showing your stall and selling area."
          onPress={() => {
            Alert.alert('Upload stall photo', 'Camera capture and compression will be connected in the document upload slice.');
          }}
        />

        <View style={styles.confirmations}>
          <ConfirmationRow
            error={fieldErrors.hasMarketLeadershipApproval}
            isChecked={hasMarketLeadershipApproval}
            label="Market leadership has approved this stall application."
            onPress={() => {
              setHasMarketLeadershipApproval((currentValue) => !currentValue);
              if (fieldErrors.hasMarketLeadershipApproval) {
                setFieldErrors((currentErrors) => ({ ...currentErrors, hasMarketLeadershipApproval: undefined }));
              }
            }}
          />
          <ConfirmationRow
            error={fieldErrors.hasAcceptedPlatformTerms}
            isChecked={hasAcceptedPlatformTerms}
            label="I agree to the E-Katale platform terms."
            onPress={() => {
              setHasAcceptedPlatformTerms((currentValue) => !currentValue);
              if (fieldErrors.hasAcceptedPlatformTerms) {
                setFieldErrors((currentErrors) => ({ ...currentErrors, hasAcceptedPlatformTerms: undefined }));
              }
            }}
          />
          <ConfirmationRow
            error={fieldErrors.hasAcceptedCommissionTerms}
            isChecked={hasAcceptedCommissionTerms}
            label="I agree to the vendor commission terms."
            onPress={() => {
              setHasAcceptedCommissionTerms((currentValue) => !currentValue);
              if (fieldErrors.hasAcceptedCommissionTerms) {
                setFieldErrors((currentErrors) => ({ ...currentErrors, hasAcceptedCommissionTerms: undefined }));
              }
            }}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToReview} />
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

interface ConfirmationRowProps {
  label: string;
  isChecked: boolean;
  onPress: () => void;
  error?: string | undefined;
}

function ConfirmationRow({ label, isChecked, onPress, error }: ConfirmationRowProps) {
  return (
    <View style={styles.confirmationItem}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
        onPress={onPress}
        style={({ pressed }) => [styles.confirmationRow, pressed ? styles.confirmationPressed : null]}>
        <View style={[styles.checkbox, isChecked ? styles.checkboxChecked : null]}>
          {isChecked ? <View style={styles.checkboxInnerMark} /> : null}
        </View>
        <AppText style={styles.confirmationLabel}>{label}</AppText>
      </Pressable>
      {error ? (
        <AppText color="secondary" style={styles.fieldError} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  confirmations: {
    gap: spacing.sm,
  },
  confirmationItem: {
    gap: spacing.xs,
  },
  confirmationRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  confirmationPressed: {
    opacity: 0.78,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxInnerMark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
  },
  confirmationLabel: {
    flex: 1,
  },
  fieldError: {
    color: colors.error,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
