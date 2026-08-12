import { parseRiderVerificationDetails } from "@sokoni-digital/validation";
import { AppButton, AppScreen, AppText, UploadCard, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

export default function RiderVerificationScreen() {
  const [hasAssociationConfirmation, setHasAssociationConfirmation] = useState(false);
  const [hasAcceptedPlatformTerms, setHasAcceptedPlatformTerms] = useState(false);
  const [hasAcceptedSafetyTerms, setHasAcceptedSafetyTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    hasAssociationConfirmation?: string;
    hasAcceptedPlatformTerms?: string;
    hasAcceptedSafetyTerms?: string;
  }>({});

  function continueToReview() {
    const result = parseRiderVerificationDetails({
      hasAssociationConfirmation,
      hasAcceptedPlatformTerms,
      hasAcceptedSafetyTerms,
    });

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    router.push("./review");
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Verification</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Add proof that your rider details are verified before administrator review.
        </AppText>
      </View>

      <View style={styles.form}>
        <UploadCard
          title="Association confirmation"
          description="Upload a rider association card, letter, or signed confirmation."
          onPress={() => {
            Alert.alert(
              "Upload association proof",
              "Private verification upload will be connected in the document upload slice.",
            );
          }}
        />
        <UploadCard
          title="Delivery readiness evidence"
          description="Upload any required rider permit, clearance, or delivery readiness document."
          onPress={() => {
            Alert.alert(
              "Upload readiness evidence",
              "Private verification upload will be connected in the document upload slice.",
            );
          }}
        />

        <View style={styles.confirmations}>
          <ConfirmationRow
            error={fieldErrors.hasAssociationConfirmation}
            isChecked={hasAssociationConfirmation}
            label="My rider association details are accurate and can be verified."
            onPress={() => {
              setHasAssociationConfirmation((currentValue) => !currentValue);
              if (fieldErrors.hasAssociationConfirmation) {
                setFieldErrors((currentErrors) => ({
                  ...currentErrors,
                  hasAssociationConfirmation: undefined,
                }));
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
                setFieldErrors((currentErrors) => ({
                  ...currentErrors,
                  hasAcceptedPlatformTerms: undefined,
                }));
              }
            }}
          />
          <ConfirmationRow
            error={fieldErrors.hasAcceptedSafetyTerms}
            isChecked={hasAcceptedSafetyTerms}
            label="I agree to the rider safety and delivery conduct terms."
            onPress={() => {
              setHasAcceptedSafetyTerms((currentValue) => !currentValue);
              if (fieldErrors.hasAcceptedSafetyTerms) {
                setFieldErrors((currentErrors) => ({
                  ...currentErrors,
                  hasAcceptedSafetyTerms: undefined,
                }));
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
        style={({ pressed }) => [
          styles.confirmationRow,
          pressed ? styles.confirmationPressed : null,
        ]}
      >
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
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
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
