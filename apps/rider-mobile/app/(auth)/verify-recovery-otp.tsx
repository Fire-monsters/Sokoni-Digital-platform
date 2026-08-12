import { parseOtpCode } from "@sokoni-digital/validation";
import { AppButton, AppScreen, AppText, OtpInput, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

export default function RiderVerifyRecoveryOtpScreen() {
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber?: string }>();
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | undefined>();

  function verifyRecoveryCode() {
    const result = parseOtpCode(otpCode);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setError(undefined);
    router.push({
      pathname: "./create-new-password",
      params: {
        phoneNumber: phoneNumber ?? "",
      },
    });
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Enter recovery code</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Enter the 6-digit code sent to {phoneNumber ?? "your phone number"}.
          </AppText>
        </View>

        <View style={styles.form}>
          <OtpInput
            error={error}
            onChangeText={(value) => {
              setOtpCode(value);
              if (error) {
                setError(undefined);
              }
            }}
            value={otpCode}
          />
          <View style={styles.notice}>
            <AppText color="secondary" variant="caption">
              Codes expire after a short time. Invalid, expired and resend cooldown states will be
              connected through the backend slice.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Verify code" onPress={verifyRecoveryCode} />
        <AppButton
          label="Resend code"
          onPress={() => {
            Alert.alert(
              "Resend code",
              "Recovery OTP resend cooldown will be connected with the backend OTP service.",
            );
          }}
          variant="secondary"
        />
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
  content: {
    flex: 1,
    gap: spacing.xl,
  },
  copy: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.information,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
