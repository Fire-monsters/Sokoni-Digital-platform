import type { VendorOrderTransitionTarget } from "@sokoni-digital/domain";
import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { Image } from "expo-image";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";

import {
  useCompleteQualityCheck,
  useConfirmVendorPickup,
  useVendorOrder,
  useVendorOrderTransition,
} from "@/features/orders/hooks";
import {
  captureQualityImage,
  flushQualityImageUploads,
  pickQualityImage,
  queueQualityImageUpload,
  uploadQualityImage,
} from "@/features/orders/quality-upload";
import { useQualityWorkflowStore } from "@/features/orders/quality-store";
import { createOperationId } from "@/features/orders/uuid";
import { useVendorApiOptions } from "@/features/listings/hooks";

const checklistLabels = {
  itemsChecked: "All ordered items are packed",
  quantitiesChecked: "Quantities match the order",
  packagingSecure: "Packaging is secure",
} as const;

export default function VendorOrderDetailsScreen() {
  const { sellerOrderId = "" } = useLocalSearchParams<{ sellerOrderId: string }>();
  const query = useVendorOrder(sellerOrderId);
  const transition = useVendorOrderTransition(sellerOrderId);
  const completeCheck = useCompleteQualityCheck(sellerOrderId);
  const confirmPickup = useConfirmVendorPickup(sellerOrderId);
  const { options } = useVendorApiOptions();
  const apiBaseUrl = options.baseUrl;
  const accessToken = options.accessToken;
  const refetchOrder = query.refetch;
  const completionOperationId = useRef(createOperationId());
  const workflow = useQualityWorkflowStore();
  const beginWorkflow = useQualityWorkflowStore((state) => state.begin);

  useEffect(() => beginWorkflow(sellerOrderId), [beginWorkflow, sellerOrderId]);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (state.isConnected && accessToken) {
          void flushQualityImageUploads({ baseUrl: apiBaseUrl, accessToken }).then(() =>
            refetchOrder(),
          );
        }
      }),
    [accessToken, apiBaseUrl, refetchOrder],
  );

  const performTransition = async (
    toStatus: VendorOrderTransitionTarget,
    expectedVersion: number,
  ) => {
    try {
      await transition.mutateAsync({ toStatus, expectedVersion, operationId: createOperationId() });
      await query.refetch();
    } catch (error) {
      Alert.alert("Order not updated", error instanceof Error ? error.message : "Try again.");
    }
  };

  const preparePhoto = async (source: "camera" | "library") => {
    workflow.setUploadStatus("preparing");
    try {
      const image = source === "camera" ? await captureQualityImage() : await pickQualityImage();
      workflow.setPreparedImage(image);
    } catch (error) {
      workflow.setUploadStatus(
        "error",
        error instanceof Error ? error.message : "The photograph could not be prepared.",
      );
    }
  };

  const uploadPhoto = async () => {
    if (!workflow.preparedImage) return;
    workflow.setUploadStatus("uploading");
    try {
      const result = await uploadQualityImage(options, sellerOrderId, workflow.preparedImage);
      workflow.setUploadedThumbnail(result.thumbnailUrl);
      await query.refetch();
    } catch (error) {
      await queueQualityImageUpload(sellerOrderId, workflow.preparedImage);
      workflow.setUploadStatus(
        "error",
        `Saved for upload when the connection returns. ${
          error instanceof Error ? error.message : "The photograph could not be uploaded."
        }`,
      );
    }
  };

  if (query.isPending) {
    return (
      <AppScreen>
        <ActivityIndicator color={colors.primary} size="large" />
      </AppScreen>
    );
  }
  if (!query.data) {
    return (
      <AppScreen>
        <AppText variant="heading3">Order unavailable</AppText>
        <AppButton label="Try again" onPress={() => void query.refetch()} />
      </AppScreen>
    );
  }

  const order = query.data;
  const proofUrl = workflow.uploadedThumbnailUrl ?? order.packingProofThumbnailUrl;
  const checklistComplete = Object.values(workflow.checklist).every(Boolean);

  const confirmPacking = async () => {
    try {
      if (order.qualityCheck.status !== "completed") {
        await completeCheck.mutateAsync({ operationId: completionOperationId.current });
      }
      await transition.mutateAsync({
        toStatus: "quality_verified",
        expectedVersion: order.version,
        operationId: createOperationId(),
      });
      workflow.reset();
      await query.refetch();
    } catch (error) {
      Alert.alert("Packing not confirmed", error instanceof Error ? error.message : "Try again.");
    }
  };

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="heading1">{order.reference}</AppText>
        <AppText color="secondary">
          {order.status.replaceAll("_", " ")} · v{order.version}
        </AppText>
      </View>

      <View style={styles.card}>
        <AppText variant="heading3">Items</AppText>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemCopy}>
              <AppText>{item.productName}</AppText>
              <AppText color="secondary" variant="caption">
                {item.packageLabel} × {item.quantity}
              </AppText>
            </View>
            <AppText variant="label">UGX {item.lineTotalUgx.toLocaleString()}</AppText>
          </View>
        ))}
        <View style={styles.totalRow}>
          <AppText variant="label">Order subtotal</AppText>
          <AppText variant="heading3">UGX {order.subtotalUgx.toLocaleString()}</AppText>
        </View>
      </View>

      {order.deliveryPickup ? (
        <View style={styles.actionCard}>
          <AppText variant="heading3">Rider handover</AppText>
          <AppText color="secondary">
            Delivery {order.deliveryPickup.deliveryReference} ·{" "}
            {order.deliveryPickup.deliveryStatus.replaceAll("_", " ")}
          </AppText>
          <AppText variant="caption">
            Seller {order.deliveryPickup.vendorConfirmed ? "confirmed" : "not confirmed"} · Rider{" "}
            {order.deliveryPickup.riderConfirmed ? "confirmed" : "not confirmed"}
          </AppText>
          {!order.deliveryPickup.vendorConfirmed ? (
            <AppButton
              label="Confirm order handed to rider"
              loading={confirmPickup.isPending}
              disabled={order.deliveryPickup.deliveryStatus !== "arrived_at_market"}
              onPress={() =>
                void confirmPickup
                  .mutateAsync({ operationId: createOperationId() })
                  .then(() => query.refetch())
                  .catch((error) =>
                    Alert.alert(
                      "Handover not confirmed",
                      error instanceof Error ? error.message : "Try again.",
                    ),
                  )
              }
            />
          ) : (
            <AppText style={styles.success}>
              {order.deliveryPickup.riderConfirmed
                ? "Custody transferred to the rider."
                : "Your confirmation is saved. Waiting for the rider."}
            </AppText>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <AppText variant="heading3">Fulfilment</AppText>
        <AppText>{order.fulfilment.type === "delivery" ? "Delivery" : "Market pickup"}</AppText>
        <AppText color="secondary" variant="caption">
          {order.fulfilment.scheduleType === "immediate"
            ? "Prepare as soon as possible"
            : `Requested for ${order.fulfilment.requestedFor ?? "scheduled time"}`}
        </AppText>
      </View>

      {order.status === "awaiting_vendor_acceptance" ? (
        <View style={styles.actionCard}>
          <AppText variant="heading3">Can you prepare every item?</AppText>
          <AppText color="secondary">Accept only after checking the complete order above.</AppText>
          <AppButton
            label="Accept order"
            loading={transition.isPending}
            onPress={() => void performTransition("accepted", order.version)}
          />
        </View>
      ) : null}

      {order.status === "accepted" ? (
        <View style={styles.actionCard}>
          <AppText variant="heading3">Ready to begin?</AppText>
          <AppText color="secondary">Pack all items, check quantities, then add a photo.</AppText>
          <AppButton
            label="Start preparing"
            loading={transition.isPending}
            onPress={() => void performTransition("preparing", order.version)}
          />
        </View>
      ) : null}

      {order.status === "preparing" ? (
        <View style={styles.actionCard}>
          <AppText variant="heading3">Packing photograph</AppText>
          <AppText color="secondary">
            Show the full packed order in good light. The photo stays private.
          </AppText>
          {workflow.preparedImage || proofUrl ? (
            <Image
              source={{ uri: workflow.preparedImage?.thumbnailUri ?? proofUrl ?? "" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={styles.proofImage}
            />
          ) : null}
          {!workflow.preparedImage && !proofUrl ? (
            <View style={styles.actions}>
              <AppButton
                label="Open camera"
                disabled={workflow.uploadStatus === "preparing"}
                onPress={() => void preparePhoto("camera")}
              />
              <AppButton
                label="Choose from gallery"
                variant="secondary"
                disabled={workflow.uploadStatus === "preparing"}
                onPress={() => void preparePhoto("library")}
              />
            </View>
          ) : null}
          {workflow.preparedImage ? (
            <View style={styles.actions}>
              <AppButton
                label="Use and upload photo"
                loading={workflow.uploadStatus === "uploading"}
                onPress={() => void uploadPhoto()}
              />
              <AppButton
                label="Retake"
                variant="secondary"
                disabled={workflow.uploadStatus === "uploading"}
                onPress={() => void preparePhoto("camera")}
              />
            </View>
          ) : null}
          {workflow.uploadStatus === "ready" || proofUrl ? (
            <AppText style={styles.success}>Photo uploaded successfully.</AppText>
          ) : null}
          {workflow.error ? <AppText style={styles.error}>{workflow.error}</AppText> : null}
        </View>
      ) : null}

      {order.status === "preparing" && proofUrl ? (
        <View style={styles.actionCard}>
          <AppText variant="heading3">Packing checklist</AppText>
          {order.qualityCheck.status === "completed" ? (
            <AppText style={styles.success}>Checklist and packing photo are verified.</AppText>
          ) : (
            (Object.keys(checklistLabels) as (keyof typeof checklistLabels)[]).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: workflow.checklist[item] }}
                onPress={() => workflow.toggleChecklistItem(item)}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, workflow.checklist[item] ? styles.checked : null]}>
                  <AppText color={workflow.checklist[item] ? "inverse" : "primary"}>
                    {workflow.checklist[item] ? "✓" : ""}
                  </AppText>
                </View>
                <AppText style={styles.checkLabel}>{checklistLabels[item]}</AppText>
              </Pressable>
            ))
          )}
          <AppButton
            label={
              order.qualityCheck.status === "completed"
                ? "Mark quality verified"
                : "Confirm packing"
            }
            disabled={!checklistComplete && order.qualityCheck.status !== "completed"}
            loading={completeCheck.isPending || transition.isPending}
            onPress={() => void confirmPacking()}
          />
        </View>
      ) : null}

      {order.status === "quality_verified" ? (
        <View style={styles.successCard}>
          <AppText variant="heading2">Quality check complete</AppText>
          <AppText>Your order can now be marked ready for collection.</AppText>
          <AppButton
            label="Mark ready for pickup"
            loading={transition.isPending}
            onPress={() => void performTransition("ready_for_pickup", order.version)}
          />
        </View>
      ) : null}

      {order.status === "ready_for_pickup" ? (
        <View style={styles.successCard}>
          <AppText variant="heading2">Ready for pickup</AppText>
          <AppText>The order is verified and waiting for the next fulfilment step.</AppText>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  header: { gap: spacing.xs },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  actionCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
  },
  successCard: {
    gap: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
  },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemCopy: { flex: 1 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  proofImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12 },
  actions: { gap: spacing.sm },
  success: { color: colors.success },
  error: { color: colors.error },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  checked: { backgroundColor: colors.primary },
  checkLabel: { flex: 1 },
});
