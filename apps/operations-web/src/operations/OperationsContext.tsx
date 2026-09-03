import {
  fetchAdminListingQueue,
  fetchAdminPriceQueue,
  fetchDispatcherDeliveryBoard,
  fetchDispatcherRiders,
} from "@sokoni-digital/api-client";
import type {
  AdminListingReview,
  AdminPriceReview,
  DispatcherDeliveryBoard,
  DispatcherRider,
} from "@sokoni-digital/domain";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
type State = {
  token: string;
  loading: boolean;
  connected: boolean;
  message: string;
  setMessage: (value: string) => void;
  setLoading: (value: boolean) => void;
  loadDeliveries: () => Promise<void>;
  loadCatalogue: () => Promise<void>;
  listings: AdminListingReview[];
  prices: AdminPriceReview[];
  deliveryBoard: DispatcherDeliveryBoard;
  riders: DispatcherRider[];
};
const Context = createContext<State | null>(null);
export function OperationsProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const tokenValue = accessToken ?? "";
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [listings, setListings] = useState<AdminListingReview[]>([]);
  const [prices, setPrices] = useState<AdminPriceReview[]>([]);
  const [deliveryBoard, setDeliveryBoard] = useState<DispatcherDeliveryBoard>({
    deliveries: [],
    issues: [],
  });
  const [riders, setRiders] = useState<DispatcherRider[]>([]);
  const runLoad = useCallback(
    async (request: () => Promise<void>) => {
      if (!tokenValue) return;
      setLoading(true);
      setMessage("");
      try {
        await request();
        setConnected(true);
      } catch (error) {
        setConnected(false);
        setMessage(
          error instanceof Error ? error.message : "Could not connect to the operations API.",
        );
      } finally {
        setLoading(false);
      }
    },
    [tokenValue],
  );
  const loadDeliveries = useCallback(
    () =>
      runLoad(async () => {
        const [board, availableRiders] = await Promise.all([
          fetchDispatcherDeliveryBoard({ baseUrl, accessToken: tokenValue }),
          fetchDispatcherRiders({ baseUrl, accessToken: tokenValue }),
        ]);
        setDeliveryBoard(board);
        setRiders(availableRiders);
      }),
    [runLoad, tokenValue],
  );
  const loadCatalogue = useCallback(
    () =>
      runLoad(async () => {
        const [listingQueue, priceQueue] = await Promise.all([
          fetchAdminListingQueue({ baseUrl, accessToken: tokenValue }),
          fetchAdminPriceQueue({ baseUrl, accessToken: tokenValue }),
        ]);
        setListings(listingQueue.listings);
        setPrices(priceQueue.requests);
      }),
    [runLoad, tokenValue],
  );
  const value = useMemo(
    () => ({
      token: tokenValue,
      loading,
      connected,
      message,
      setMessage,
      setLoading,
      loadDeliveries,
      loadCatalogue,
      listings,
      prices,
      deliveryBoard,
      riders,
    }),
    [
      tokenValue,
      loading,
      connected,
      message,
      loadDeliveries,
      loadCatalogue,
      listings,
      prices,
      deliveryBoard,
      riders,
    ],
  );
  return <Context value={value}>{children}</Context>;
}
// The provider and its narrowly scoped consumer hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("useOperations must be used inside OperationsProvider");
  return value;
}
