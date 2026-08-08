import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, onlineManager } from "@tanstack/react-query";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
);

export const consumerQueryClient = new QueryClient();

export const consumerQueryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "sokoni-public-catalogue-v1",
  throttleTime: 1_000,
});
