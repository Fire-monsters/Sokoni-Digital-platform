import { AppText, colors, spacing } from "@sokoni-digital/ui";
import { Pressable, StyleSheet, View } from "react-native";

const supportedMethods = ["MTN MoMo", "Airtel Money", "Visa", "Mastercard"];

interface PaymentProviderCardProps {
  allowPayAtPickup: boolean;
  selected: "pesapal" | "market_pickup";
  onSelect(provider: "pesapal" | "market_pickup"): void;
}

export function PaymentProviderCard({
  allowPayAtPickup,
  selected,
  onSelect,
}: PaymentProviderCardProps) {
  return (
    <View style={styles.container}>
      <AppText variant="heading2">How would you like to pay?</AppText>
      <Pressable
        onPress={() => onSelect("pesapal")}
        style={[styles.card, selected === "pesapal" && styles.selectedCard]}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected === "pesapal" }}
      >
        <View style={styles.headingRow}>
          <SelectionIndicator selected={selected === "pesapal"} />
          <View style={styles.headingCopy}>
            <AppText variant="heading2">Pesapal</AppText>
            <AppText color="secondary">Secure hosted payment</AppText>
          </View>
          {selected === "pesapal" ? <SelectedLabel /> : null}
        </View>
        <AppText color="secondary">
          Choose your payment method after the secure Pesapal window opens.
        </AppText>
        <View style={styles.methods}>
          {supportedMethods.map((method) => (
            <View key={method} style={styles.method}>
              <AppText variant="caption">{method}</AppText>
            </View>
          ))}
        </View>
      </Pressable>
      {allowPayAtPickup ? (
        <Pressable
          onPress={() => onSelect("market_pickup")}
          style={[styles.card, selected === "market_pickup" && styles.selectedCard]}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === "market_pickup" }}
        >
          <View style={styles.headingRow}>
            <SelectionIndicator selected={selected === "market_pickup"} />
            <View style={styles.headingCopy}>
              <AppText variant="heading2">Pay at market pickup</AppText>
              <AppText color="secondary">
                Your items are allocated now; pay when you collect them.
              </AppText>
            </View>
            {selected === "market_pickup" ? <SelectedLabel /> : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function SelectionIndicator({ selected }: { selected: boolean }) {
  return <View style={[styles.selectionIndicator, selected && styles.selectedIndicator]} />;
}

function SelectedLabel() {
  return (
    <AppText variant="label" style={styles.selectedLabel}>
      Selected
    </AppText>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  headingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headingCopy: { flex: 1 },
  selectionIndicator: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: "white",
  },
  selectedIndicator: { borderWidth: 5, borderColor: colors.primary },
  selectedLabel: { color: colors.primary },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  method: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
});
