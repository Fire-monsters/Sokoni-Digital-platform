import { parsePasswordPair } from "@sokoni-digital/validation";
import { AppButton, AppScreen, AppText, PasswordField, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

export default function RiderCreatePasswordScreen() {
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber?: string }>();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | undefined>();

  function continueToRegistration() {
    const result = parsePasswordPair(password, passwordConfirmation);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setError(undefined);
    router.push({
      pathname: "../(registration)/personal-details",
      params: {
        phoneNumber: phoneNumber ?? "",
      },
    });
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Create your password</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Protect the rider account for {phoneNumber ?? "your verified phone number"}.
          </AppText>
        </View>

        <View style={styles.form}>
          <PasswordField
            error={error}
            onChangeText={(value) => {
              setPassword(value);
              if (error) {
                setError(undefined);
              }
            }}
            value={password}
          />
          <PasswordField
            label="Confirm password"
            onChangeText={(value) => {
              setPasswordConfirmation(value);
              if (error) {
                setError(undefined);
              }
            }}
            value={passwordConfirmation}
          />
          <View style={styles.notice}>
            <AppText color="secondary" variant="caption">
              Use at least 8 characters with uppercase, lowercase and a number. Password storage
              will remain inside Supabase Auth.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToRegistration} />
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
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
