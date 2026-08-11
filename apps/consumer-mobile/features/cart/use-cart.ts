import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { useCallback } from "react";

import { createGuestCart, putCartItem } from "./cart-api";
import { useCartStore, type LocalCartItem } from "./cart-store";
import { consumerSupabase } from "@/lib/supabase";

export function useCartActions() {
  const store = useCartStore();
  const sync = useCallback(async () => {
    const state = useCartStore.getState();
    if (!(await NetInfo.fetch()).isConnected || state.items.length === 0) {
      state.setSyncStatus("failed");
      return;
    }
    state.setSyncStatus("syncing");
    try {
      let cartId = state.backendCartId;
      if (!cartId) {
        cartId = (await createGuestCart(state.items[0]!.marketId)).id;
        state.setBackendCartId(cartId);
      }
      const { data: auth } = await consumerSupabase.auth.getSession();
      for (const item of useCartStore.getState().items.filter((candidate) => candidate.pending)) {
        await putCartItem(
          cartId,
          item.listingId,
          item.quantity,
          item.operationId,
          auth.session?.access_token,
        );
        useCartStore.getState().markSynced(item.listingId);
      }
      state.setSyncStatus("idle");
    } catch {
      state.setSyncStatus("failed");
    }
  }, []);
  return {
    ...store,
    add(item: Omit<LocalCartItem, "quantity" | "pending" | "operationId">) {
      store.add(item, Crypto.randomUUID());
      void sync();
    },
    changeQuantity(listingId: string, quantity: number) {
      store.setQuantity(listingId, quantity, Crypto.randomUUID());
      void sync();
    },
    retrySync: sync,
  };
}
