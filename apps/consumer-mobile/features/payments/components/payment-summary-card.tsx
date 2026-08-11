import { AppText, colors, spacing } from "@sokoni-digital/ui";
import { StyleSheet, View } from "react-native";

import { formatUgx } from "@/features/catalogue/components";

interface PaymentSummaryCardProps {
  amount: number;
  merchantReference: string;
  paymentMethod: string | null;
}

export function PaymentSummaryCard({
  amount,
  merchantReference,
  paymentMethod,
}: PaymentSummaryCardProps) {
  return (
    <View style={styles.card}>
      <AppText variant="heading2">{formatUgx(amount)}</AppText>
      <AppText color="secondary">Reference {merchantReference}</AppText>
      {paymentMethod ? <AppText>Paid using {formatMethod(paymentMethod)}</AppText> : null}
    </View>
  );
}

function formatMethod(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
});
