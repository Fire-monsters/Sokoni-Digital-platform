import { create } from "zustand";

import type { PreparedQualityImage } from "./quality-upload";

interface QualityWorkflowState {
  orderId: string | null;
  preparedImage: PreparedQualityImage | null;
  uploadedThumbnailUrl: string | null;
  uploadStatus: "idle" | "preparing" | "uploading" | "ready" | "error";
  error: string | null;
  checklist: {
    itemsChecked: boolean;
    quantitiesChecked: boolean;
    packagingSecure: boolean;
  };
  begin: (orderId: string) => void;
  setPreparedImage: (image: PreparedQualityImage | null) => void;
  setUploadStatus: (status: QualityWorkflowState["uploadStatus"], error?: string) => void;
  setUploadedThumbnail: (url: string) => void;
  toggleChecklistItem: (item: keyof QualityWorkflowState["checklist"]) => void;
  reset: () => void;
}

const initialChecklist = {
  itemsChecked: false,
  quantitiesChecked: false,
  packagingSecure: false,
};

export const useQualityWorkflowStore = create<QualityWorkflowState>((set) => ({
  orderId: null,
  preparedImage: null,
  uploadedThumbnailUrl: null,
  uploadStatus: "idle",
  error: null,
  checklist: initialChecklist,
  begin: (orderId) =>
    set((state) =>
      state.orderId === orderId
        ? state
        : {
            orderId,
            preparedImage: null,
            uploadedThumbnailUrl: null,
            uploadStatus: "idle",
            error: null,
            checklist: initialChecklist,
          },
    ),
  setPreparedImage: (preparedImage) =>
    set({ preparedImage, uploadStatus: preparedImage ? "idle" : "idle", error: null }),
  setUploadStatus: (uploadStatus, error) => set({ uploadStatus, error: error ?? null }),
  setUploadedThumbnail: (uploadedThumbnailUrl) =>
    set({ uploadedThumbnailUrl, preparedImage: null, uploadStatus: "ready", error: null }),
  toggleChecklistItem: (item) =>
    set((state) => ({
      checklist: { ...state.checklist, [item]: !state.checklist[item] },
    })),
  reset: () =>
    set({
      orderId: null,
      preparedImage: null,
      uploadedThumbnailUrl: null,
      uploadStatus: "idle",
      error: null,
      checklist: initialChecklist,
    }),
}));
