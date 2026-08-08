import {
  apiQueryKeys,
  fetchCatalogueHome,
  fetchCatalogueListing,
  fetchCatalogueListings,
} from "@sokoni-digital/api-client";
import type { CatalogueQuery } from "@sokoni-digital/domain";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { publicApiOptions } from "@/lib/api";

import { catalogueQueryDefaults } from "./query-options";

export function useCatalogueHome(reducedData: boolean) {
  return useQuery({
    queryKey: apiQueryKeys.catalogueHome(undefined, reducedData),
    queryFn: () => fetchCatalogueHome(publicApiOptions, { reducedData }),
    ...catalogueQueryDefaults,
  });
}

export function useCatalogueListings(query: Omit<CatalogueQuery, "cursor">) {
  return useInfiniteQuery({
    queryKey: apiQueryKeys.catalogueListings(query),
    queryFn: ({ pageParam }) =>
      fetchCatalogueListings(publicApiOptions, {
        ...query,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...catalogueQueryDefaults,
  });
}

export function useCatalogueListing(listingId: string) {
  return useQuery({
    queryKey: apiQueryKeys.catalogueListing(listingId),
    queryFn: () => fetchCatalogueListing(publicApiOptions, listingId),
    enabled: listingId.length > 0,
    ...catalogueQueryDefaults,
  });
}
