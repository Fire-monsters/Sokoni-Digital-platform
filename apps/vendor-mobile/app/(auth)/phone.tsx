import { parseUgandanPhoneNumber } from "@sokoni-digital/validation";
import {
  AppButton,
  AppScreen,
  AppText,
  PhoneNumberField,
  colors,
  spacing,
} from "@sokoni-digital/ui";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

export default function VendorPhoneScreen() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | undefined>();

  function continueToOtp() {
    const result = parseUgandanPhoneNumber(phoneNumber);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setError(undefined);
    router.push({
      pathname: "./verify-otp",
      params: {
        phoneNumber: result.phoneNumber,
      },
    });
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Register your stall</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Enter the phone number you will use for orders, OTP verification and account recovery.
          </AppText>
        </View>

        <View style={styles.form}>
          <PhoneNumberField
            error={error}
            onChangeText={(value) => {
              setPhoneNumber(value);
              if (error) {
                setError(undefined);
              }
            }}
            value={phoneNumber}
          />
          <View style={styles.hint}>
            <AppText color="secondary" variant="caption">
              Use a Ugandan number such as +256 7XX XXX XXX. We store phone numbers in E.164 format.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToOtp} />
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
    gap: spacing.sm,
  },
  hint: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
