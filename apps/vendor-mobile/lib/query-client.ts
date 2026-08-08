import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, onlineManager } from "@tanstack/react-query";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
);

export const vendorQueryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "offlineFirst", retry: 2, staleTime: 30_000, gcTime: 86_400_000 },
    mutations: { networkMode: "offlineFirst", retry: 2 },
  },
});

export const vendorQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "sokoni-vendor-query-v1",
  throttleTime: 1_000,
});
