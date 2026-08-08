export const catalogueQueryDefaults = {
  staleTime: 5 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
  networkMode: "offlineFirst" as const,
  retry: 2,
  refetchOnWindowFocus: false,
};
