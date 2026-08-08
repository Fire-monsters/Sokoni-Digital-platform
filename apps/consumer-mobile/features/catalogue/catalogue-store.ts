import { create } from "zustand";

interface CatalogueInterfaceState {
  search: string;
  reducedData: boolean;
  setSearch: (search: string) => void;
  toggleReducedData: () => void;
}

export const useCatalogueInterface = create<CatalogueInterfaceState>((set) => ({
  search: "",
  reducedData: true,
  setSearch: (search) => set({ search }),
  toggleReducedData: () => set((state) => ({ reducedData: !state.reducedData })),
}));
