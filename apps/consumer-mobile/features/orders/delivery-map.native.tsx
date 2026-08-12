import type { ConsumerCheckoutProgress } from "@sokoni-digital/domain";
import { AppText, colors, spacing } from "@sokoni-digital/ui";
import { StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";

type Location = NonNullable<NonNullable<ConsumerCheckoutProgress["delivery"]>["riderLocation"]>;

export function DeliveryMap({
  location,
  riderName,
}: {
  location: Location;
  riderName: string | null;
}) {
  const coordinate = { latitude: location.latitude, longitude: location.longitude };
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View>
          <AppText variant="heading3">Rider location snapshot</AppText>
          <AppText color="secondary" variant="caption">
            Updated {new Date(location.receivedAt).toLocaleTimeString()}
          </AppText>
        </View>
        <View style={[styles.freshness, !location.isFresh ? styles.stale : null]}>
          <AppText variant="caption">{location.isFresh ? "Recent" : "Stale"}</AppText>
        </View>
      </View>
      <MapView
        accessibilityLabel="Google map showing the rider's last location snapshot"
        region={{ ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
        provider={PROVIDER_GOOGLE}
        rotateEnabled={false}
        style={styles.map}
        toolbarEnabled={false}
      >
        <Circle
          center={coordinate}
          radius={Math.max(20, location.accuracyMeters)}
          fillColor="rgba(31,122,77,0.12)"
          strokeColor="rgba(31,122,77,0.45)"
        />
        <Marker
          coordinate={coordinate}
          description="Last reported foreground snapshot"
          title={riderName ?? "Your rider"}
          pinColor={colors.primary}
        />
      </MapView>
      <AppText color="secondary" variant="caption">
        Location is approximate (±{Math.round(location.accuracyMeters)} m). Delivery status remains
        authoritative if this snapshot is stale.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  freshness: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  stale: { backgroundColor: "#FFF2D8" },
  map: { width: "100%", height: 260, borderRadius: 14 },
});
