import type { PendingListingImage } from "@sokoni-digital/offline-sync";
import { create } from "zustand";

interface ListingEditorState {
  step: number;
  catalogProductId: string;
  packageQuantity: string;
  packageUnit: string;
  description: string;
  proposedPriceUgx: string;
  images: PendingListingImage[];
  setField: (
    field:
      "catalogProductId" | "packageQuantity" | "packageUnit" | "description" | "proposedPriceUgx",
    value: string,
  ) => void;
  setStep: (step: number) => void;
  addImage: (image: PendingListingImage) => void;
  updateImage: (localId: string, patch: Partial<PendingListingImage>) => void;
  reset: () => void;
}

const initial = {
  step: 1,
  catalogProductId: "",
  packageQuantity: "1",
  packageUnit: "kg",
  description: "",
  proposedPriceUgx: "",
  images: [] as PendingListingImage[],
};

export const useListingEditor = create<ListingEditorState>((set) => ({
  ...initial,
  setField: (field, value) => set({ [field]: value }),
  setStep: (step) => set({ step }),
  addImage: (image) => set((state) => ({ images: [...state.images, image] })),
  updateImage: (localId, patch) =>
    set((state) => ({
      images: state.images.map((image) =>
        image.localId === localId ? { ...image, ...patch } : image,
      ),
    })),
  reset: () => set(initial),
}));
