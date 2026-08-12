import type { ConsumerCheckoutProgress } from "@sokoni-digital/domain";
import { AppButton, AppText, colors, spacing } from "@sokoni-digital/ui";
import { Linking, StyleSheet, View } from "react-native";

type Location = NonNullable<NonNullable<ConsumerCheckoutProgress["delivery"]>["riderLocation"]>;

export function DeliveryMap({ location }: { location: Location; riderName: string | null }) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
  return (
    <View style={styles.card}>
      <AppText variant="heading3">Rider location snapshot</AppText>
      <AppText color="secondary">
        Updated {new Date(location.receivedAt).toLocaleString()} · approximately ±
        {Math.round(location.accuracyMeters)} m.
      </AppText>
      <AppButton
        label="Open snapshot in Google Maps"
        onPress={() => void Linking.openURL(url)}
        variant="secondary"
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
});
