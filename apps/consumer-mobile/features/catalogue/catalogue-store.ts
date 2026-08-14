import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface CatalogueInterfaceState {
  search: string;
  reducedData: boolean;
  setSearch: (search: string) => void;
  toggleReducedData: () => void;
}

export const useCatalogueInterface = create<CatalogueInterfaceState>()(
  persist(
    (set) => ({
      search: "",
      reducedData: true,
      setSearch: (search) => set({ search }),
      toggleReducedData: () => set((state) => ({ reducedData: !state.reducedData })),
    }),
    {
      name: "ekatale-consumer-preferences-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ reducedData: state.reducedData }),
    },
  ),
);
