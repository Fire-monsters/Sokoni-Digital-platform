import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  apiQueryKeys,
  archiveVendorListing,
  changeVendorListingAvailability,
  createListingPriceRequest,
  createVendorListing,
  fetchCatalogueProducts,
  fetchVendorListing,
  fetchVendorListings,
  submitVendorListing,
  updateVendorListing,
  type CreateVendorListingInput,
} from "@sokoni-digital/api-client";
import type { ListingAvailability } from "@sokoni-digital/domain";
import { PersistentOperationQueue } from "@sokoni-digital/offline-sync";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAccessToken } from "@/hooks/use-auth-session";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const availabilityQueue = new PersistentOperationQueue<{
  listingId: string;
  availability: ListingAvailability;
  expectedVersion: number;
}>(AsyncStorage, "sokoni-availability-queue-v1");
let availabilityQueueHydration: ReturnType<typeof availabilityQueue.hydrate> | undefined;

function ensureAvailabilityQueueHydrated() {
  availabilityQueueHydration ??= availabilityQueue.hydrate();
  return availabilityQueueHydration;
}

export function useVendorApiOptions() {
  const accessToken = useAccessToken();
  return {
    options: { baseUrl, ...(accessToken ? { accessToken } : {}) },
    enabled: Boolean(accessToken),
  };
}

export function useProducts() {
  return useQuery({
    queryKey: apiQueryKeys.catalogueProducts,
    queryFn: () => fetchCatalogueProducts({ baseUrl }),
    staleTime: 60 * 60 * 1000,
    networkMode: "offlineFirst",
  });
}

export function useVendorListings() {
  const { options, enabled } = useVendorApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.vendorListings,
    queryFn: () => fetchVendorListings(options),
    enabled,
  });
}

export function useVendorListing(listingId: string) {
  const { options, enabled } = useVendorApiOptions();
  return useQuery({
    queryKey: apiQueryKeys.vendorListing(listingId),
    queryFn: () => fetchVendorListing(options, listingId),
    enabled: enabled && Boolean(listingId),
  });
}

export function useCreateVendorListing() {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVendorListingInput) => createVendorListing(options, input),
    onSuccess: (listing) => {
      client.setQueryData(apiQueryKeys.vendorListing(listing.id), listing);
      void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings });
    },
  });
}

export function useSubmitVendorListing(listingId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => submitVendorListing(options, listingId),
    onSuccess: (listing) => {
      client.setQueryData(apiQueryKeys.vendorListing(listing.id), listing);
      void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings });
    },
  });
}

export function useUpdateVendorListing(listingId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { packageQuantity?: number; packageUnit?: string; description?: string }) =>
      updateVendorListing(options, listingId, input),
    onSuccess: (listing) => {
      client.setQueryData(apiQueryKeys.vendorListing(listing.id), listing);
      void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings });
    },
  });
}

export function useArchiveVendorListing(listingId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => archiveVendorListing(options, listingId),
    onSuccess: () => void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings }),
  });
}

export function usePriceRequest(listingId: string) {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposedPriceUgx: number; reason?: string }) =>
      createListingPriceRequest(options, listingId, input),
    onSuccess: (listing) => {
      client.setQueryData(apiQueryKeys.vendorListing(listing.id), listing);
      void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings });
    },
  });
}

export function useAvailabilityMutation() {
  const { options } = useVendorApiOptions();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      availability: ListingAvailability;
      expectedVersion: number;
      operationId: string;
    }) => {
      try {
        return await changeVendorListingAvailability(options, input.listingId, input);
      } catch (error) {
        await ensureAvailabilityQueueHydrated();
        await availabilityQueue.enqueue({
          id: input.operationId,
          kind: "availability",
          payload: {
            listingId: input.listingId,
            availability: input.availability,
            expectedVersion: input.expectedVersion,
          },
        });
        throw error;
      }
    },
    onSettled: () => void client.invalidateQueries({ queryKey: apiQueryKeys.vendorListings }),
  });
}

export async function flushAvailabilityQueue(accessToken: string) {
  await ensureAvailabilityQueueHydrated();
  return availabilityQueue.flush((operation) =>
    changeVendorListingAvailability({ baseUrl, accessToken }, operation.payload.listingId, {
      availability: operation.payload.availability,
      expectedVersion: operation.payload.expectedVersion,
      operationId: operation.id,
    }).then(() => undefined),
  );
}
