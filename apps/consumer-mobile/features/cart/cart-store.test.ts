import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useCartStore } from "./cart-store";

describe("guest cart weak-network state", () => {
  beforeEach(() =>
    useCartStore.setState({ backendCartId: null, items: [], syncStatus: "idle", adjustments: [] }),
  );

  it("keeps optimistic quantities and the same operation id while pending", () => {
    const item = {
      listingId: "listing-1",
      productName: "Tomatoes",
      packageLabel: "1 kg",
      sellerId: "seller-1",
      sellerName: "Kato",
      marketId: "market-1",
      unitPriceUgx: 4000,
      thumbnailUrl: null,
    };
    useCartStore.getState().add(item, "operation-1");
    expect(useCartStore.getState().items[0]).toMatchObject({
      quantity: 1,
      pending: true,
      operationId: "operation-1",
    });
    useCartStore.getState().setSyncStatus("failed");
    expect(useCartStore.getState().items[0]).toMatchObject({
      quantity: 1,
      operationId: "operation-1",
    });
  });
});
