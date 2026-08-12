import {
  apiQueryKeys,
  fetchCheckoutProgress,
  fetchConsumerQualityProof,
  fetchConsumerDeliveryEvidence,
  rotateConsumerDeliveryPin,
} from "@sokoni-digital/api-client";

import type {
  ConsumerSellerOrderProgress,
  DeliveryEvidence,
  DeliveryPin,
  DeliveryStatus,
} from "@sokoni-digital/domain";
import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useConsumerAuth } from "@/features/auth/auth-provider";
import { qualityProofImagePolicy } from "@/features/orders/quality-proof-policy";
import { DeliveryMap } from "@/features/orders/delivery-map";
import {
  canGenerateDeliveryPin,
  canViewDeliveryEvidence,
} from "@/features/orders/delivery-handover-policy";
import { publicApiOptions } from "@/lib/api";

function SellerOrderCard({ order, token }: { order: ConsumerSellerOrderProgress; token: string }) {
  const [proofRequested, setProofRequested] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const proof = useQuery({
    queryKey: apiQueryKeys.qualityProof(order.id),
    queryFn: () => fetchConsumerQualityProof({ ...publicApiOptions, accessToken: token }, order.id),
    enabled: proofRequested && order.qualityCheck.status === "completed",
    staleTime: qualityProofImagePolicy.signedUrlStaleTimeMs,
    retry: 2,
    refetchOnReconnect: true,
  });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="heading3">{order.seller.name}</AppText>
          <AppText color="secondary" variant="caption">
            {order.reference} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </AppText>
        </View>
        <AppText variant="label">UGX {order.subtotalUgx.toLocaleString()}</AppText>
      </View>

      <View style={styles.timeline}>
        {order.timeline.map((step, index) => (
          <View key={step.status} style={styles.timelineRow}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  step.completed ? styles.dotComplete : null,
                  step.current ? styles.dotCurrent : null,
                ]}
              />
              {index < order.timeline.length - 1 ? (
                <View style={[styles.line, step.completed ? styles.lineComplete : null]} />
              ) : null}
            </View>
            <View style={styles.stepCopy}>
              <AppText color={step.completed ? "primary" : "secondary"}>{step.label}</AppText>
              {step.at ? (
                <AppText color="secondary" variant="caption">
                  {new Date(step.at).toLocaleString()}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {order.qualityCheck.status === "completed" ? (
        <View style={styles.proofSection}>
          {!proofRequested ? (
            <AppButton
              label="View quality proof"
              variant="secondary"
              onPress={() => setProofRequested(true)}
            />
          ) : null}
          {proof.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {proof.data ? (
            <>
              <Image
                source={{ uri: showFull ? proof.data.fullUrl : proof.data.thumbnailUrl }}
                contentFit="cover"
                cachePolicy={qualityProofImagePolicy.cachePolicy}
                priority={showFull ? "normal" : qualityProofImagePolicy.thumbnailPriority}
                transition={150}
                onLoadStart={() => setImageLoading(true)}
                onLoadEnd={() => setImageLoading(false)}
                onError={() => void proof.refetch()}
                style={styles.proofImage}
              />
              {imageLoading ? <AppText color="secondary">Loading image…</AppText> : null}
              {!showFull ? (
                <AppButton
                  label="Load full photo"
                  variant="secondary"
                  onPress={() => setShowFull(true)}
                />
              ) : null}
            </>
          ) : null}
          {proof.isError ? (
            <AppButton
              label="Retry proof"
              variant="secondary"
              onPress={() => void proof.refetch()}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DeliveryHandover({
  deliveryId,
  status,
  token,
}: {
  deliveryId: string;
  status: DeliveryStatus;
  token: string;
}) {
  const [pin, setPin] = useState<DeliveryPin>();
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string>();
  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const evidence = useQuery<DeliveryEvidence>({
    queryKey: apiQueryKeys.deliveryEvidence(deliveryId),
    queryFn: () =>
      fetchConsumerDeliveryEvidence({ ...publicApiOptions, accessToken: token }, deliveryId),
    enabled: evidenceRequested && canViewDeliveryEvidence(status),
    staleTime: 4 * 60 * 1000,
    refetchOnReconnect: true,
  });
  const canGeneratePin = canGenerateDeliveryPin(status);

  async function generatePin(): Promise<void> {
    setPinLoading(true);
    setPinError(undefined);
    try {
      setPin(
        await rotateConsumerDeliveryPin({ ...publicApiOptions, accessToken: token }, deliveryId),
      );
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "PIN could not be generated.");
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <View style={styles.handoverCard}>
      {canGeneratePin ? (
        <>
          <AppText variant="heading3">Secure delivery PIN</AppText>
          <AppText color="secondary" variant="caption">
            Generate this only when you are ready to receive the order. Share it with the assigned
            rider after checking your packages.
          </AppText>
          {pin ? (
            <View
              accessibilityLabel={`Delivery PIN ${pin.pin.split("").join(" ")}`}
              style={styles.pinPanel}
            >
              <AppText variant="caption">ONE-TIME DELIVERY PIN</AppText>
              <AppText style={styles.pinText} variant="heading1">
                {pin.pin}
              </AppText>
              <AppText color="secondary" variant="caption">
                Expires {new Date(pin.expiresAt).toLocaleString()}
              </AppText>
            </View>
          ) : null}
          <AppButton
            label={pin ? "Generate a new PIN" : "Generate delivery PIN"}
            loading={pinLoading}
            onPress={() => void generatePin()}
            variant={pin ? "secondary" : "primary"}
          />
          {pinError ? <AppText style={styles.error}>{pinError}</AppText> : null}
        </>
      ) : null}

      {canViewDeliveryEvidence(status) ? (
        <View style={styles.evidenceSection}>
          <AppText variant="heading3">Delivery evidence</AppText>
          <AppText color="secondary" variant="caption">
            These private links expire automatically and are generated only when requested.
          </AppText>
          {!evidenceRequested ? (
            <AppButton
              label="View delivery evidence"
              onPress={() => setEvidenceRequested(true)}
              variant="secondary"
            />
          ) : null}
          {evidence.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {evidence.data ? (
            <>
              <AppText color="secondary" variant="caption">
                Consumer confirmed{" "}
                {evidence.data.consumerConfirmedAt
                  ? new Date(evidence.data.consumerConfirmedAt).toLocaleString()
                  : "—"}
              </AppText>
              {evidence.data.images.map((image) => (
                <Image
                  key={image.id}
                  source={{ uri: image.thumbnailUrl }}
                  contentFit="cover"
                  cachePolicy="memory"
                  transition={150}
                  style={styles.proofImage}
                />
              ))}
            </>
          ) : null}
          {evidence.isError ? (
            <AppButton
              label="Retry evidence"
              onPress={() => void evidence.refetch()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ConsumerOrderProgressScreen() {
  const { checkoutId = "" } = useLocalSearchParams<{ checkoutId: string }>();
  const { session } = useConsumerAuth();
  const token = session?.access_token;
  const progress = useQuery({
    queryKey: apiQueryKeys.checkoutProgress(checkoutId),
    queryFn: () => fetchCheckoutProgress({ ...publicApiOptions, accessToken: token }, checkoutId),
    enabled: Boolean(token && checkoutId),
    refetchInterval: 20_000,
    refetchOnReconnect: true,
  });

  if (progress.isPending) {
    return (
      <AppScreen contentStyle={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </AppScreen>
    );
  }
  if (!progress.data || !token) {
    return (
      <AppScreen contentStyle={styles.center}>
        <AppText variant="heading2">Order progress unavailable</AppText>
        <AppButton label="Try again" onPress={() => void progress.refetch()} />
      </AppScreen>
    );
  }
  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">Order {progress.data.reference}</AppText>
      <AppText color="secondary">Each seller prepares and verifies their part separately.</AppText>
      {progress.data.delivery ? (
        <View style={styles.deliveryCard}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="caption">DELIVERY · {progress.data.delivery.reference}</AppText>
              <AppText variant="heading2">
                {progress.data.delivery.status === "arrived_at_customer"
                  ? "Your rider has arrived"
                  : progress.data.delivery.status.replaceAll("_", " ")}
              </AppText>
            </View>
            {progress.data.delivery.riderName ? (
              <AppText variant="label">{progress.data.delivery.riderName}</AppText>
            ) : null}
          </View>
          <AppText color="secondary">
            {progress.data.delivery.destinationLabel} · {progress.data.delivery.destinationSummary}
          </AppText>
          {progress.data.delivery.riderLocation ? (
            <DeliveryMap
              location={progress.data.delivery.riderLocation}
              riderName={progress.data.delivery.riderName}
            />
          ) : progress.data.delivery.riderName && progress.data.delivery.status !== "delivered" ? (
            <View style={styles.locationUnavailable}>
              <AppText variant="label">Rider location unavailable</AppText>
              <AppText color="secondary" variant="caption">
                The delivery timeline will continue updating. Location is optional and never blocks
                handover.
              </AppText>
            </View>
          ) : null}
          <View style={styles.timeline}>
            {progress.data.delivery.timeline.map((step, index) => (
              <View key={step.status} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.dot,
                      step.completed ? styles.dotComplete : null,
                      step.current ? styles.dotCurrent : null,
                    ]}
                  />
                  {index < progress.data.delivery!.timeline.length - 1 ? (
                    <View style={[styles.line, step.completed ? styles.lineComplete : null]} />
                  ) : null}
                </View>
                <View style={styles.stepCopy}>
                  <AppText color={step.completed ? "primary" : "secondary"}>{step.label}</AppText>
                  {step.at ? (
                    <AppText color="secondary" variant="caption">
                      {new Date(step.at).toLocaleString()}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          <DeliveryHandover
            deliveryId={progress.data.delivery.id}
            status={progress.data.delivery.status}
            token={token}
          />
        </View>
      ) : null}
      {progress.data.sellerOrders.map((order) => (
        <SellerOrderCard key={order.id} order={order} token={token} />
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  deliveryCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", minHeight: 56 },
  rail: { width: 24, alignItems: "center" },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotComplete: { borderColor: colors.primary, backgroundColor: colors.primary },
  dotCurrent: { width: 16, height: 16, borderRadius: 8 },
  line: { width: 2, flex: 1, backgroundColor: colors.border },
  lineComplete: { backgroundColor: colors.primary },
  stepCopy: { flex: 1, paddingLeft: spacing.sm, paddingBottom: spacing.sm },
  proofSection: { gap: spacing.sm },
  proofImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  handoverCard: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pinPanel: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  pinText: { letterSpacing: 10 },
  evidenceSection: { gap: spacing.sm },
  error: { color: colors.error },
  locationUnavailable: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
});
