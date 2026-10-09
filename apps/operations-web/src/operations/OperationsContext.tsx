import {
  fetchAdminListingQueue,
  fetchAdminPriceQueue,
  fetchDispatcherDeliveryBoard,
  fetchDispatcherRiders,
} from "../demo/service";
import type {
  AdminListingReview,
  AdminPriceReview,
  DispatcherDeliveryBoard,
  DispatcherRider,
} from "@sokoni-digital/domain";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
type State = {
  loading: boolean;
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [listings, setListings] = useState<AdminListingReview[]>([]);
  const [prices, setPrices] = useState<AdminPriceReview[]>([]);
  const [deliveryBoard, setDeliveryBoard] = useState<DispatcherDeliveryBoard>({
    deliveries: [],
    issues: [],
  });
  const [riders, setRiders] = useState<DispatcherRider[]>([]);
  const runLoad = useCallback(async (request: () => Promise<void>) => {
    setLoading(true);
    try {
      await request();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load demo data.");
    } finally {
      setLoading(false);
    }
  }, []);
  const loadDeliveries = useCallback(
    () =>
      runLoad(async () => {
        const [board, availableRiders] = await Promise.all([
          fetchDispatcherDeliveryBoard(),
          fetchDispatcherRiders(),
        ]);
        setDeliveryBoard(board);
        setRiders(availableRiders);
      }),
    [runLoad],
  );
  const loadCatalogue = useCallback(
    () =>
      runLoad(async () => {
        const [listingQueue, priceQueue] = await Promise.all([
          fetchAdminListingQueue(),
          fetchAdminPriceQueue(),
        ]);
        setListings(listingQueue.listings);
        setPrices(priceQueue.requests);
      }),
    [runLoad],
  );
  const value = useMemo(
    () => ({
      loading,
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
    [loading, message, loadDeliveries, loadCatalogue, listings, prices, deliveryBoard, riders],
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
