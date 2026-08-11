import { AppText, AppTextField, colors, spacing } from "@sokoni-digital/ui";
import { StyleSheet, View } from "react-native";

interface PayerContactFieldsProps {
  phone: string;
  email: string;
  onPhoneChange(value: string): void;
  onEmailChange(value: string): void;
}

export function PayerContactFields({
  phone,
  email,
  onPhoneChange,
  onEmailChange,
}: PayerContactFieldsProps) {
  return (
    <View style={styles.container}>
      <AppText variant="heading3">Confirm payer details</AppText>
      <AppTextField
        label="Payer phone number"
        value={phone}
        onChangeText={onPhoneChange}
        keyboardType="phone-pad"
      />
      <AppText variant="caption" color="secondary">
        Use international format, for example +256772123456. Pesapal may use it for the payment
        prompt.
      </AppText>
      <AppTextField
        label="Email (optional)"
        value={email}
        onChangeText={onEmailChange}
        keyboardType="email-address"
      />
      <View style={styles.safetyNotice}>
        <AppText variant="caption">
          E-Katale will never ask for your Mobile Money PIN. Enter it only inside Pesapal’s secure
          window.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  safetyNotice: {
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
});
