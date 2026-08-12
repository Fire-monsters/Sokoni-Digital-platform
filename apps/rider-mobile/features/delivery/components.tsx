import type {
  DeliveryIssueReason,
  RiderCurrentDelivery,
  RiderDeliveryOffer,
} from "@sokoni-digital/domain";
import { AppButton, AppText, colors, spacing } from "@sokoni-digital/ui";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { createOperationId } from "./hooks";

function useRemainingSeconds(expiresAt: string): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1_000));
}

export function DeliveryOfferCard({
  offer,
  busy,
  onAccept,
  onReject,
}: {
  offer: RiderDeliveryOffer;
  busy: boolean;
  onAccept: (input: {
    offerId: string;
    expectedDeliveryVersion: number;
    operationId: string;
  }) => void;
  onReject: (input: { offerId: string; operationId: string }) => void;
}) {
  const seconds = useRemainingSeconds(offer.expiresAt);
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <View style={styles.offerCard} accessibilityLabel={`Delivery offer, ${countdown} remaining`}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="caption">NEW DELIVERY · {offer.deliveryReference}</AppText>
          <AppText variant="heading2">UGX {offer.feeUgx.toLocaleString()}</AppText>
        </View>
        <View style={[styles.countdown, seconds <= 10 ? styles.countdownUrgent : null]}>
          <AppText variant="heading3">{countdown}</AppText>
        </View>
      </View>
      <AppText variant="heading3">
        {offer.market.name} → {offer.zoneName}
      </AppText>
      <AppText color="secondary">
        {offer.distanceKm.toFixed(1)} km to pickup · {offer.sellerCount} seller
        {offer.sellerCount === 1 ? "" : "s"} · {offer.packageCount} package
        {offer.packageCount === 1 ? "" : "s"}
      </AppText>
      {seconds === 0 ? (
        <AppText style={styles.error}>This offer is expiring. Refreshing…</AppText>
      ) : null}
      <View style={styles.actions}>
        <AppButton
          label="Accept delivery"
          disabled={seconds === 0 || busy}
          loading={busy}
          onPress={() =>
            onAccept({
              offerId: offer.id,
              expectedDeliveryVersion: offer.deliveryVersion,
              operationId: createOperationId(),
            })
          }
          style={styles.flex}
        />
        <AppButton
          label="Reject"
          disabled={seconds === 0 || busy}
          onPress={() => onReject({ offerId: offer.id, operationId: createOperationId() })}
          style={styles.flex}
          variant="secondary"
        />
      </View>
    </View>
  );
}

export function CurrentDeliveryCard({
  delivery,
  busy,
  onConfirmPickup,
  onTransition,
  onConfirmPin,
  onCaptureProof,
  onComplete,
  onReportIssue,
}: {
  delivery: RiderCurrentDelivery;
  busy: boolean;
  onConfirmPickup: (sellerOrderId: string) => void;
  onTransition: (
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer",
  ) => void;
  onConfirmPin: (pin: string) => void;
  onCaptureProof: () => void;
  onComplete: () => void;
  onReportIssue: (reason: DeliveryIssueReason, note: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [showIssue, setShowIssue] = useState(false);
  const [issueReason, setIssueReason] = useState<DeliveryIssueReason>("CUSTOMER_UNAVAILABLE");
  const [issueNote, setIssueNote] = useState("");
  const allCollected = useMemo(
    () =>
      delivery.pickups.length > 0 &&
      delivery.pickups.every((pickup) => pickup.status === "collected"),
    [delivery.pickups],
  );
  const nextAction =
    delivery.status === "assigned"
      ? { label: "I have arrived at the market", status: "arrived_at_market" as const }
      : delivery.status === "arrived_at_market" && allCollected
        ? { label: "All orders collected", status: "picked_up" as const }
        : delivery.status === "picked_up"
          ? { label: "Start delivery", status: "in_transit" as const }
          : delivery.status === "in_transit"
            ? { label: "I have arrived at the customer", status: "arrived_at_customer" as const }
            : null;

  return (
    <View style={styles.deliveryCard}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="caption">CURRENT DELIVERY</AppText>
          <AppText variant="heading2">{delivery.reference}</AppText>
        </View>
        <View style={styles.statusPill}>
          <AppText variant="caption">{delivery.status.replaceAll("_", " ")}</AppText>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <AppText variant="label">Pickup · {delivery.market.name}</AppText>
        <AppText variant="label">Drop-off · {delivery.destination.label}</AppText>
        <AppText color="secondary" variant="caption">
          {delivery.destination.summary} · {delivery.destination.phoneNumber}
        </AppText>
      </View>

      {delivery.status === "arrived_at_market" ? (
        <View style={styles.checklist}>
          <AppText variant="heading3">Seller pickup checklist</AppText>
          {delivery.pickups.map((pickup) => (
            <View key={pickup.id} style={styles.pickupRow}>
              <View
                style={[styles.check, pickup.status === "collected" ? styles.checkComplete : null]}
              >
                <AppText color={pickup.status === "collected" ? "inverse" : "primary"}>
                  {pickup.status === "collected" ? "✓" : ""}
                </AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="label">{pickup.sellerName}</AppText>
                <AppText color="secondary" variant="caption">
                  {pickup.sellerOrderReference} · {pickup.itemCount} item
                  {pickup.itemCount === 1 ? "" : "s"}
                </AppText>
                <AppText color="secondary" variant="caption">
                  Seller {pickup.vendorConfirmed ? "confirmed" : "not confirmed"} · Rider{" "}
                  {pickup.riderConfirmed ? "confirmed" : "not confirmed"}
                </AppText>
              </View>
              {!pickup.riderConfirmed ? (
                <AppButton
                  label="Confirm"
                  disabled={busy}
                  onPress={() => onConfirmPickup(pickup.sellerOrderId)}
                  variant="secondary"
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {nextAction ? (
        <AppButton
          label={nextAction.label}
          loading={busy}
          onPress={() => onTransition(nextAction.status)}
        />
      ) : null}
      {delivery.status === "arrived_at_customer" ? (
        <View style={styles.proofCard}>
          <AppText variant="heading3">Protected handover</AppText>
          <View style={styles.proofStep}>
            <View
              style={[
                styles.check,
                delivery.completion.consumerConfirmed ? styles.checkComplete : null,
              ]}
            >
              <AppText color={delivery.completion.consumerConfirmed ? "inverse" : "primary"}>
                {delivery.completion.consumerConfirmed ? "✓" : "1"}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">Consumer PIN</AppText>
              <AppText color="secondary" variant="caption">
                Ask the customer for the 6-digit code shown in their order.
              </AppText>
            </View>
          </View>
          {!delivery.completion.consumerConfirmed ? (
            <View style={styles.pinRow}>
              <TextInput
                accessibilityLabel="Six digit consumer delivery PIN"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setPin(value.replace(/\D/g, ""))}
                placeholder="000000"
                secureTextEntry
                style={styles.pinInput}
                value={pin}
              />
              <AppButton
                label="Confirm PIN"
                disabled={busy || pin.length !== 6}
                onPress={() => onConfirmPin(pin)}
              />
            </View>
          ) : null}
          <View style={styles.proofStep}>
            <View
              style={[
                styles.check,
                delivery.completion.readyProofImageCount > 0 ? styles.checkComplete : null,
              ]}
            >
              <AppText color={delivery.completion.readyProofImageCount > 0 ? "inverse" : "primary"}>
                {delivery.completion.readyProofImageCount > 0 ? "✓" : "2"}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">Delivery photo</AppText>
              <AppText color="secondary" variant="caption">
                Private evidence is compressed before upload and visible only to the customer and
                operations team.
              </AppText>
            </View>
          </View>
          {delivery.completion.readyProofImageCount === 0 ? (
            <AppButton
              label="Take proof photo"
              disabled={busy}
              onPress={onCaptureProof}
              variant="secondary"
            />
          ) : null}
          <AppButton
            label="Complete delivery"
            disabled={
              busy ||
              !delivery.completion.consumerConfirmed ||
              delivery.completion.readyProofImageCount === 0
            }
            loading={busy}
            onPress={onComplete}
          />
        </View>
      ) : null}

      {delivery.status !== "delivered" ? (
        <View style={styles.issueCard}>
          <AppButton
            label={showIssue ? "Cancel issue report" : "Report a problem"}
            disabled={busy}
            onPress={() => setShowIssue((value) => !value)}
            variant="secondary"
          />
          {showIssue ? (
            <View style={styles.issueForm}>
              <AppText variant="label">What happened?</AppText>
              <View style={styles.issueOptions}>
                {(
                  [
                    "CUSTOMER_UNAVAILABLE",
                    "INCORRECT_ADDRESS",
                    "PRODUCT_DAMAGED",
                    "VEHICLE_PROBLEM",
                  ] as const
                ).map((reason) => (
                  <AppButton
                    key={reason}
                    label={reason.replaceAll("_", " ").toLowerCase()}
                    onPress={() => setIssueReason(reason)}
                    variant={issueReason === reason ? "primary" : "secondary"}
                  />
                ))}
              </View>
              <TextInput
                multiline
                onChangeText={setIssueNote}
                placeholder="Add a short note for the dispatcher"
                style={styles.noteInput}
                value={issueNote}
              />
              <AppButton
                label="Send to dispatcher"
                disabled={busy}
                onPress={() => {
                  onReportIssue(issueReason, issueNote);
                  setShowIssue(false);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  offerCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  deliveryCard: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  countdown: {
    minWidth: 74,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  countdownUrgent: { backgroundColor: "#FFE0DC" },
  actions: { flexDirection: "row", gap: spacing.sm },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  routeBlock: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  checklist: { gap: spacing.md },
  pickupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
  },
  checkComplete: { backgroundColor: colors.success, borderColor: colors.success },
  proofCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  proofStep: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pinRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pinInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 20,
    letterSpacing: 8,
  },
  issueCard: { gap: spacing.sm },
  issueForm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  issueOptions: { gap: spacing.xs },
  noteInput: {
    minHeight: 80,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    textAlignVertical: "top",
  },
  error: { color: colors.error },
});
