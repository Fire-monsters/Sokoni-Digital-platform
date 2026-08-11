import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PaymentRecoveryState {
  activePaymentAttemptId: string | null;
  setActivePaymentAttemptId(value: string | null): void;
}

export const usePaymentRecoveryStore = create<PaymentRecoveryState>()(
  persist(
    (set) => ({
      activePaymentAttemptId: null,
      setActivePaymentAttemptId: (activePaymentAttemptId) => set({ activePaymentAttemptId }),
    }),
    {
      name: "ekatale-active-payment-v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
