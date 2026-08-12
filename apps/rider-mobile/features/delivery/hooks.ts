import {
  ApiClientError,
  acceptDeliveryOffer,
  apiQueryKeys,
  changeRiderAvailability,
  completeRiderDelivery,
  confirmConsumerDeliveryPin,
  confirmRiderDeliveryPickup,
  fetchCurrentDeliveryOffer,
  fetchCurrentRiderDelivery,
  fetchRiderStatus,
  rejectDeliveryOffer,
  reportRiderDeliveryIssue,
  transitionRiderDelivery,
  updateRiderLocation,
} from "@sokoni-digital/api-client";
import {
  shouldPersistProofUploadFailure,
  shouldQueueDeliveryTransition,
  type DeliveryIssueReason,
  type RiderCurrentDelivery,
  type RiderSelectedAvailability,
} from "@sokoni-digital/domain";
import NetInfo from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useEffect } from "react";

import { useAccessToken } from "@/hooks/use-auth-session";
import {
  clearAssignment,
  listQueuedDeliveryOperations,
  listQueuedProofUploads,
  loadAssignment,
  queueDeliveryOperation,
  queueProofUpload,
  removeQueuedDeliveryOperation,
  removeQueuedProofUpload,
  saveAssignment,
} from "./assignment-cache";
import { uploadDeliveryProof, type PreparedDeliveryProof } from "./proof-upload";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export function createOperationId(): string {
  return Crypto.randomUUID();
}

export function useRiderApiOptions() {
  const accessToken = useAccessToken();
  return {
    options: { baseUrl, ...(accessToken ? { accessToken } : {}) },
    enabled: Boolean(accessToken),
  };
}

export function useRiderStatus() {
  const { options, enabled } = useRiderApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.riderStatus,
    queryFn: () => fetchRiderStatus(options),
    enabled,
    networkMode: "offlineFirst",
    staleTime: 30_000,
  });
}

export function useCurrentDeliveryOffer() {
  const { options, enabled } = useRiderApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.riderOffer,
    queryFn: () => fetchCurrentDeliveryOffer(options),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useCurrentRiderDelivery() {
  const { options, enabled } = useRiderApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.riderDelivery,
    queryFn: async () => {
      try {
        const assignment = await fetchCurrentRiderDelivery(options);
        if (assignment) await saveAssignment(assignment);
        else await clearAssignment();
        return assignment;
      } catch (error) {
        const cached = await loadAssignment();
        if (cached) return cached;
        throw error;
      }
    },
    enabled,
    networkMode: "offlineFirst",
    refetchInterval: 15_000,
  });
}

export function useRiderAvailabilityMutation() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { availability: RiderSelectedAvailability; operationId: string }) =>
      changeRiderAvailability(options, input),
    onSuccess: (state) => client.setQueryData(apiQueryKeys.riderStatus, state),
  });
}

export function useRiderLocationMutation() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      capturedAt: string;
      operationId: string;
    }) => updateRiderLocation(options, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: apiQueryKeys.riderStatus }),
  });
}

export function useOfferDecisionMutations() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  const settle = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: apiQueryKeys.riderOffer }),
      client.invalidateQueries({ queryKey: apiQueryKeys.riderDelivery }),
      client.invalidateQueries({ queryKey: apiQueryKeys.riderStatus }),
    ]);
  };
  return {
    accept: useMutation({
      mutationFn: (input: {
        offerId: string;
        expectedDeliveryVersion: number;
        operationId: string;
      }) =>
        acceptDeliveryOffer(options, input.offerId, {
          expectedDeliveryVersion: input.expectedDeliveryVersion,
          operationId: input.operationId,
        }),
      onSuccess: settle,
    }),
    reject: useMutation({
      mutationFn: (input: { offerId: string; operationId: string }) =>
        rejectDeliveryOffer(options, input.offerId, { operationId: input.operationId }),
      onSuccess: settle,
    }),
  };
}

export function usePickupConfirmationMutation() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { deliveryId: string; sellerOrderId: string; operationId: string }) =>
      confirmRiderDeliveryPickup(options, input.deliveryId, input.sellerOrderId, {
        operationId: input.operationId,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: apiQueryKeys.riderDelivery }),
  });
}

export function useDeliveryTransitionMutation() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      deliveryId: string;
      toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer";
      expectedVersion: number;
      operationId: string;
    }) => {
      try {
        return await transitionRiderDelivery(options, input.deliveryId, {
          toStatus: input.toStatus,
          expectedVersion: input.expectedVersion,
          operationId: input.operationId,
        });
      } catch (error) {
        if (
          error instanceof ApiClientError ||
          !shouldQueueDeliveryTransition(input.toStatus) ||
          (input.toStatus !== "arrived_at_market" && input.toStatus !== "in_transit")
        )
          throw error;
        await queueDeliveryOperation({
          deliveryId: input.deliveryId,
          toStatus: input.toStatus,
          expectedVersion: input.expectedVersion,
          operationId: input.operationId,
        });
        return {
          deliveryId: input.deliveryId,
          status: input.toStatus,
          version: input.expectedVersion + 1,
          operationId: input.operationId,
          duplicate: false,
        };
      }
    },
    onSuccess: async (result) => {
      const current = client.getQueryData<RiderCurrentDelivery | null>(apiQueryKeys.riderDelivery);
      if (current?.id === result.deliveryId) {
        const updated = { ...current, status: result.status, version: result.version };
        client.setQueryData(apiQueryKeys.riderDelivery, updated);
        await saveAssignment(updated);
      }
      void client.invalidateQueries({ queryKey: apiQueryKeys.riderStatus });
    },
  });
}

export function useDeliveryProofMutations() {
  const { options } = useRiderApiOptions();
  const client = useQueryClient();
  const refreshDelivery = () => client.invalidateQueries({ queryKey: apiQueryKeys.riderDelivery });
  return {
    confirmPin: useMutation({
      mutationFn: (input: { deliveryId: string; pin: string; operationId: string }) =>
        confirmConsumerDeliveryPin(options, input.deliveryId, {
          pin: input.pin,
          operationId: input.operationId,
        }),
      onSuccess: refreshDelivery,
    }),
    uploadProof: useMutation({
      mutationFn: async (input: { deliveryId: string; proof: PreparedDeliveryProof }) => {
        try {
          return await uploadDeliveryProof(options, input.deliveryId, input.proof);
        } catch (error) {
          if (error instanceof ApiClientError || !shouldPersistProofUploadFailure("network"))
            throw error;
          await queueProofUpload({
            operationId: input.proof.operationId,
            deliveryId: input.deliveryId,
            payload: input.proof,
          });
          throw new Error(
            "Proof saved securely on this device. It will upload when the connection returns.",
          );
        }
      },
      onSuccess: refreshDelivery,
    }),
    complete: useMutation({
      mutationFn: (input: { deliveryId: string; expectedVersion: number; operationId: string }) =>
        completeRiderDelivery(options, input.deliveryId, {
          expectedVersion: input.expectedVersion,
          operationId: input.operationId,
        }),
      onSuccess: async () => {
        await clearAssignment();
        client.setQueryData(apiQueryKeys.riderDelivery, null);
        await Promise.all([
          client.invalidateQueries({ queryKey: apiQueryKeys.riderStatus }),
          client.invalidateQueries({ queryKey: apiQueryKeys.riderDelivery }),
        ]);
      },
    }),
    reportIssue: useMutation({
      mutationFn: (input: {
        deliveryId: string;
        reason: DeliveryIssueReason;
        note: string;
        expectedVersion: number;
        operationId: string;
      }) => reportRiderDeliveryIssue(options, input.deliveryId, input),
    }),
  };
}

export function useFlushDeliveryOperations(): void {
  const { options, enabled } = useRiderApiOptions();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const flush = async () => {
      for (const operation of await listQueuedDeliveryOperations()) {
        try {
          await transitionRiderDelivery(options, operation.deliveryId, {
            toStatus: operation.toStatus,
            expectedVersion: operation.expectedVersion,
            operationId: operation.operationId,
          });
          await removeQueuedDeliveryOperation(operation.operationId);
        } catch (error) {
          if (error instanceof ApiClientError) {
            await removeQueuedDeliveryOperation(operation.operationId);
          } else {
            break;
          }
        }
      }
      for (const upload of await listQueuedProofUploads<PreparedDeliveryProof>()) {
        try {
          await uploadDeliveryProof(options, upload.deliveryId, upload.payload);
          await removeQueuedProofUpload(upload.operationId);
        } catch (error) {
          if (error instanceof ApiClientError) await removeQueuedProofUpload(upload.operationId);
          else break;
        }
      }
      await client.invalidateQueries({ queryKey: apiQueryKeys.riderDelivery });
    };
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void flush();
    });
    void flush();
    return unsubscribe;
  }, [client, enabled, options.accessToken]);
}
