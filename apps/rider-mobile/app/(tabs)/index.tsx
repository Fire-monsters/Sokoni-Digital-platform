import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { isLocationSnapshotUsable, type RiderSelectedAvailability } from "@sokoni-digital/domain";
import * as Location from "expo-location";
import { useNetInfo } from "@react-native-community/netinfo";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { CurrentDeliveryCard, DeliveryOfferCard } from "@/features/delivery/components";

import {
  createOperationId,
  useCurrentDeliveryOffer,
  useCurrentRiderDelivery,
  useDeliveryTransitionMutation,
  useDeliveryProofMutations,
  useFlushDeliveryOperations,
  useOfferDecisionMutations,
  usePickupConfirmationMutation,
  useRiderAvailabilityMutation,
  useRiderLocationMutation,
  useRiderStatus,
} from "@/features/delivery/hooks";
import { captureDeliveryProof } from "@/features/delivery/proof-upload";

function formatUpdatedAt(value: string | undefined): string {
  if (!value) return "Not updated yet";
  return `Updated ${new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function RiderHomeScreen() {
  const statusQuery = useRiderStatus();
  const offerQuery = useCurrentDeliveryOffer();
  const deliveryQuery = useCurrentRiderDelivery();
  const offerDecisions = useOfferDecisionMutations();
  const pickupMutation = usePickupConfirmationMutation();
  const deliveryTransition = useDeliveryTransitionMutation();
  const proofMutations = useDeliveryProofMutations();
  const availabilityMutation = useRiderAvailabilityMutation();
  const locationMutation = useRiderLocationMutation();
  const [actionError, setActionError] = useState<string>();
  const status = statusQuery.data;
  const offer = offerQuery.data;
  const delivery = deliveryQuery.data;
  const network = useNetInfo();
  useFlushDeliveryOperations();
  const isUpdating = availabilityMutation.isPending || locationMutation.isPending;
  const proofBusy =
    proofMutations.confirmPin.isPending ||
    proofMutations.uploadProof.isPending ||
    proofMutations.complete.isPending ||
    proofMutations.reportIssue.isPending;

  async function updateLocation(): Promise<void> {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw new Error("Location permission is needed to receive nearby delivery offers.");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (!position.coords.accuracy || position.coords.accuracy > 500) {
      throw new Error("Location accuracy is too low. Move outdoors and try again.");
    }

    await locationMutation.mutateAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString(),
      operationId: createOperationId(),
    });
  }

  async function chooseAvailability(next: RiderSelectedAvailability): Promise<void> {
    setActionError(undefined);
    try {
      if (next === "available" && !status?.locationIsFresh) {
        await updateLocation();
      }
      await availabilityMutation.mutateAsync({
        availability: next,
        operationId: createOperationId(),
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The rider update could not be saved.",
      );
    }
  }

  async function refreshLocation(): Promise<void> {
    setActionError(undefined);
    try {
      await updateLocation();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Location could not be updated.");
    }
  }

  async function transitionWithSnapshot(
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer",
  ): Promise<void> {
    if (!delivery) return;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.GRANTED) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const accuracyMeters = position.coords.accuracy;
        if (
          accuracyMeters !== null &&
          isLocationSnapshotUsable({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters,
          })
        ) {
          await locationMutation.mutateAsync({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters,
            capturedAt: new Date(position.timestamp).toISOString(),
            operationId: createOperationId(),
          });
        }
      }
    } catch {
      // A location snapshot is best effort and must never block a custody transition.
    }
    await deliveryTransition.mutateAsync({
      deliveryId: delivery.id,
      toStatus,
      expectedVersion: delivery.version,
      operationId: createOperationId(),
    });
  }

  function showActionError(title: string, error: unknown): void {
    Alert.alert(title, error instanceof Error ? error.message : "Please refresh and try again.");
  }

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.statusDot, status?.eligibleForOffers ? styles.onlineDot : null]} />
          <AppText variant="caption">
            {status?.eligibleForOffers ? "Ready for nearby offers" : "Not receiving offers"}
          </AppText>
        </View>
        <AppText variant="heading1">
          {status?.displayName ? `Hello, ${status.displayName.split(" ")[0]}` : "Rider workspace"}
        </AppText>
        <AppText color="secondary" variant="bodyLarge">
          Choose when you are ready to deliver. Location is shared only when you update it or during
          an active delivery.
        </AppText>
      </View>

      {network.isConnected === false || network.isInternetReachable === false ? (
        <View style={styles.offlineBanner}>
          <AppText variant="label">Low-data mode</AppText>
          <AppText color="secondary" variant="caption">
            Your assignment remains available. Safe progress updates will send when the connection
            returns.
          </AppText>
        </View>
      ) : null}

      {offer && !delivery ? (
        <DeliveryOfferCard
          offer={offer}
          busy={offerDecisions.accept.isPending || offerDecisions.reject.isPending}
          onAccept={(input) =>
            void offerDecisions.accept
              .mutateAsync(input)
              .catch((error) => showActionError("Offer not accepted", error))
          }
          onReject={(input) =>
            void offerDecisions.reject
              .mutateAsync(input)
              .catch((error) => showActionError("Offer not rejected", error))
          }
        />
      ) : null}

      {delivery ? (
        <CurrentDeliveryCard
          delivery={delivery}
          busy={pickupMutation.isPending || deliveryTransition.isPending || proofBusy}
          onConfirmPickup={(sellerOrderId) =>
            void pickupMutation
              .mutateAsync({
                deliveryId: delivery.id,
                sellerOrderId,
                operationId: createOperationId(),
              })
              .catch((error) => showActionError("Handover not confirmed", error))
          }
          onTransition={(toStatus) =>
            void transitionWithSnapshot(toStatus).catch((error) =>
              showActionError("Delivery not updated", error),
            )
          }
          onConfirmPin={(pin) =>
            void proofMutations.confirmPin
              .mutateAsync({ deliveryId: delivery.id, pin, operationId: createOperationId() })
              .then((result) => {
                if (!result.confirmed)
                  Alert.alert(
                    "PIN not confirmed",
                    `${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? "" : "s"} remaining.`,
                  );
              })
              .catch((error) => showActionError("PIN not confirmed", error))
          }
          onCaptureProof={() => {
            const location =
              status?.locationIsFresh && status.lastLocation
                ? {
                    latitude: status.lastLocation.latitude,
                    longitude: status.lastLocation.longitude,
                    accuracyMeters: status.lastLocation.accuracyMeters,
                  }
                : null;
            void captureDeliveryProof(location)
              .then((proof) =>
                proof
                  ? proofMutations.uploadProof.mutateAsync({ deliveryId: delivery.id, proof })
                  : undefined,
              )
              .catch((error) => showActionError("Proof pending", error));
          }}
          onComplete={() =>
            void proofMutations.complete
              .mutateAsync({
                deliveryId: delivery.id,
                expectedVersion: delivery.version,
                operationId: createOperationId(),
              })
              .catch((error) => showActionError("Delivery not completed", error))
          }
          onReportIssue={(reason, note) =>
            void proofMutations.reportIssue
              .mutateAsync({
                deliveryId: delivery.id,
                reason,
                note,
                expectedVersion: delivery.version,
                operationId: createOperationId(),
              })
              .then(() =>
                Alert.alert(
                  "Dispatcher notified",
                  "The delivery remains active while operations reviews the issue.",
                ),
              )
              .catch((error) => showActionError("Issue not sent", error))
          }
        />
      ) : null}

      {statusQuery.isPending ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <AppText color="secondary">Loading rider status…</AppText>
        </View>
      ) : null}

      {statusQuery.isError && !status ? (
        <View style={styles.errorCard}>
          <AppText variant="heading3">Rider status unavailable</AppText>
          <AppText color="secondary">Check your connection, then try again.</AppText>
          <AppButton label="Try again" onPress={() => void statusQuery.refetch()} />
        </View>
      ) : null}

      {status ? (
        <>
          <View style={styles.availabilityCard}>
            <View style={styles.cardHeading}>
              <View style={styles.cardCopy}>
                <AppText variant="heading3">Availability</AppText>
                <AppText color="secondary">
                  {status.availability === "available"
                    ? "You are online and can receive nearby offers."
                    : status.availability === "offline"
                      ? "You are offline. No new offers will be sent."
                      : "Availability is managed automatically for active delivery work."}
                </AppText>
              </View>
              <View
                style={[
                  styles.availabilityBadge,
                  status.availability === "available" ? styles.availableBadge : null,
                ]}
              >
                <AppText variant="caption">{status.availability.replace("_", " ")}</AppText>
              </View>
            </View>

            {status.availability === "offline" || status.availability === "available" ? (
              <View style={styles.actionRow}>
                <AppButton
                  disabled={status.availability === "available"}
                  label="Go online"
                  loading={isUpdating && status.availability === "offline"}
                  onPress={() => void chooseAvailability("available")}
                  style={styles.flexButton}
                />
                <AppButton
                  disabled={status.availability === "offline"}
                  label="Go offline"
                  onPress={() => void chooseAvailability("offline")}
                  style={styles.flexButton}
                  variant="secondary"
                />
              </View>
            ) : null}
          </View>

          <View style={styles.locationCard}>
            <View style={styles.cardHeading}>
              <View style={styles.cardCopy}>
                <AppText variant="heading3">Offer location</AppText>
                <AppText color="secondary">
                  {status.locationIsFresh
                    ? "Your coarse location is recent enough for nearby matching."
                    : "Update your location to qualify for nearby offers."}
                </AppText>
              </View>
              <View style={status.locationIsFresh ? styles.freshPill : styles.stalePill}>
                <AppText variant="caption">
                  {status.locationIsFresh ? "Current" : "Update needed"}
                </AppText>
              </View>
            </View>
            <AppText color="secondary" variant="caption">
              {formatUpdatedAt(status.lastLocation?.receivedAt)}
              {status.lastLocation
                ? ` · ±${Math.round(status.lastLocation.accuracyMeters)} m accuracy`
                : ""}
            </AppText>
            <AppButton
              label="Update location"
              loading={locationMutation.isPending}
              onPress={() => void refreshLocation()}
              variant="secondary"
            />
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <AppText variant="heading2">{offer ? 1 : 0}</AppText>
              <AppText color="secondary" variant="caption">
                Open offers
              </AppText>
            </View>
            <View style={styles.summaryCard}>
              <AppText variant="heading2">{delivery ? 1 : 0}</AppText>
              <AppText color="secondary" variant="caption">
                Active trips
              </AppText>
            </View>
          </View>
        </>
      ) : null}

      {actionError ? (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <AppText style={styles.errorText} variant="caption">
            {actionError}
          </AppText>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { gap: spacing.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  onlineDot: { backgroundColor: colors.success },
  centeredState: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  availabilityCard: {
    gap: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  locationCard: {
    gap: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardCopy: { flex: 1, gap: spacing.xs },
  availabilityBadge: {
    borderRadius: 999,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  availableBadge: { backgroundColor: colors.primaryLight },
  freshPill: {
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stalePill: {
    borderRadius: 999,
    backgroundColor: "#FFF2D8",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  flexButton: { flex: 1 },
  summaryRow: { flexDirection: "row", gap: spacing.sm },
  summaryCard: {
    flex: 1,
    gap: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
  },
  errorCard: {
    alignItems: "center",
    gap: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  offlineBanner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: "#FFF2D8",
  },
  errorBanner: { borderRadius: 10, backgroundColor: "#FDECEC", padding: spacing.md },
  errorText: { color: colors.error },
});
