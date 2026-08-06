import { parseUgandanPhoneNumber } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, PhoneNumberField, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function VendorForgotPasswordScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | undefined>();

  function requestRecoveryCode() {
    const result = parseUgandanPhoneNumber(phoneNumber);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setError(undefined);
    router.push({
      pathname: './verify-recovery-otp',
      params: {
        phoneNumber: result.phoneNumber,
      },
    });
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Reset password</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Enter your vendor phone number. If the account can be recovered, we will send a verification code.
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
          <View style={styles.notice}>
            <AppText color="secondary" variant="caption">
              For account safety, this screen does not reveal whether a phone number exists.
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Send recovery code" onPress={requestRecoveryCode} />
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
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.information,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
});
