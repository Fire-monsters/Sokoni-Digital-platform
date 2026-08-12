import { parsePasswordPair } from "@sokoni-digital/validation";
import { AppButton, AppScreen, AppText, PasswordField, colors, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

export default function RiderCreateNewPasswordScreen() {
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber?: string }>();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | undefined>();

  function saveNewPassword() {
    const result = parsePasswordPair(password, passwordConfirmation);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setError(undefined);
    router.replace({
      pathname: "./password-reset-success",
      params: {
        phoneNumber: phoneNumber ?? "",
      },
    });
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Create new password</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Set a new password for {phoneNumber ?? "your rider account"}.
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
            label="Confirm new password"
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
              Password updates will be committed through Supabase Auth in the backend authentication
              slice.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Save new password" onPress={saveNewPassword} />
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
