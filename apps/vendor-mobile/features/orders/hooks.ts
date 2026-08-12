import {
  apiQueryKeys,
  completeQualityCheck,
  confirmVendorDeliveryPickup,
  fetchVendorOrder,
  fetchVendorOrders,
  transitionVendorOrder,
} from "@sokoni-digital/api-client";
import type { VendorFulfilmentStatus, VendorOrderTransitionTarget } from "@sokoni-digital/domain";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useVendorApiOptions } from "@/features/listings/hooks";

export function useVendorOrders(statuses: VendorFulfilmentStatus[] = []) {
  const { options, enabled } = useVendorApiOptions();
  return useInfiniteQuery({
    queryKey: apiQueryKeys.vendorOrders(statuses),
    queryFn: ({ pageParam }) =>
      fetchVendorOrders(options, {
        ...(statuses.length > 0 ? { status: statuses } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
      }),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useVendorOrder(orderId: string) {
  const { options, enabled } = useVendorApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.vendorOrder(orderId),
    queryFn: () => fetchVendorOrder(options, orderId),
    enabled: enabled && Boolean(orderId),
  });
}

export function useVendorOrderTransition(orderId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      toStatus: VendorOrderTransitionTarget;
      expectedVersion: number;
      operationId: string;
    }) => transitionVendorOrder(options, orderId, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["vendor", "orders"] });
    },
  });
}

export function useCompleteQualityCheck(orderId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { operationId: string; notes?: string }) =>
      completeQualityCheck(options, orderId, {
        checklist: {
          itemsChecked: true,
          quantitiesChecked: true,
          packagingSecure: true,
        },
        ...(input.notes ? { notes: input.notes } : {}),
        operationId: input.operationId,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: apiQueryKeys.vendorOrder(orderId) });
    },
  });
}

export function useConfirmVendorPickup(orderId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { operationId: string }) =>
      confirmVendorDeliveryPickup(options, orderId, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: apiQueryKeys.vendorOrder(orderId) }),
  });
}
