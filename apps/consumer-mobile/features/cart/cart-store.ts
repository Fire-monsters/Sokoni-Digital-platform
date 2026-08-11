import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface LocalCartItem {
  listingId: string;
  productName: string;
  packageLabel: string;
  sellerId: string;
  sellerName: string;
  marketId: string;
  unitPriceUgx: number;
  thumbnailUrl: string | null;
  quantity: number;
  pending: boolean;
  operationId: string;
}

interface CartState {
  backendCartId: string | null;
  items: LocalCartItem[];
  syncStatus: "idle" | "syncing" | "failed";
  lastSyncedAt: string | null;
  adjustments: string[];
  setBackendCartId(id: string | null): void;
  add(item: Omit<LocalCartItem, "quantity" | "pending" | "operationId">, operationId: string): void;
  setQuantity(listingId: string, quantity: number, operationId: string): void;
  remove(listingId: string): void;
  setSyncStatus(status: CartState["syncStatus"]): void;
  markSynced(listingId: string): void;
  replaceFromServer(cart: ServerCart, adjustments?: string[]): void;
  clearAfterMerge(): void;
  clearAfterCheckout(): void;
}

export interface ServerCart {
  id: string;
  items: Array<{
    listingId: string;
    productName: string;
    packageLabel: string;
    quantity: number;
    unitPriceUgx: number;
    seller: { id: string; name: string };
  }>;
  marketId: string;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      backendCartId: null,
      items: [],
      syncStatus: "idle",
      lastSyncedAt: null,
      adjustments: [],
      setBackendCartId: (backendCartId) => set({ backendCartId }),
      add: (input, operationId) =>
        set((state) => {
          const existing = state.items.find((item) => item.listingId === input.listingId);
          return {
            items: existing
              ? state.items.map((item) =>
                  item.listingId === input.listingId
                    ? { ...item, quantity: item.quantity + 1, pending: true, operationId }
                    : item,
                )
              : [...state.items, { ...input, quantity: 1, pending: true, operationId }],
          };
        }),
      setQuantity: (listingId, quantity, operationId) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.listingId !== listingId)
              : state.items.map((item) =>
                  item.listingId === listingId
                    ? { ...item, quantity, pending: true, operationId }
                    : item,
                ),
        })),
      remove: (listingId) =>
        set((state) => ({ items: state.items.filter((item) => item.listingId !== listingId) })),
      setSyncStatus: (syncStatus) => set({ syncStatus }),
      markSynced: (listingId) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.listingId === listingId ? { ...item, pending: false } : item,
          ),
          lastSyncedAt: new Date().toISOString(),
        })),
      replaceFromServer: (cart, adjustments = []) =>
        set((state) => ({
          backendCartId: cart.id,
          adjustments,
          items: cart.items.map((item) => ({
            ...item,
            sellerId: item.seller.id,
            sellerName: item.seller.name,
            marketId: cart.marketId,
            thumbnailUrl:
              state.items.find((local) => local.listingId === item.listingId)?.thumbnailUrl ?? null,
            pending: false,
            operationId: "",
          })),
          syncStatus: "idle",
          lastSyncedAt: new Date().toISOString(),
        })),
      clearAfterMerge: () => set({ syncStatus: "idle", adjustments: [] }),
      clearAfterCheckout: () =>
        set({ backendCartId: null, items: [], syncStatus: "idle", adjustments: [] }),
    }),
    {
      name: "ekatale-guest-cart-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        backendCartId: state.backendCartId,
        items: state.items,
        lastSyncedAt: state.lastSyncedAt,
      }),
    },
  ),
);
