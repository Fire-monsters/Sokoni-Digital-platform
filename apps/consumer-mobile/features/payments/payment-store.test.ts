import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn().mockResolvedValue(undefined),
  removeItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

import { usePaymentRecoveryStore } from "./payment-store";

describe("payment recovery after app restart", () => {
  beforeEach(() => {
    storage.getItem.mockReset();
    usePaymentRecoveryStore.setState({ activePaymentAttemptId: null });
  });

  it("rehydrates the unresolved Pesapal attempt from durable storage", async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        state: { activePaymentAttemptId: "b3000000-0000-4000-8000-000000000001" },
        version: 0,
      }),
    );

    await usePaymentRecoveryStore.persist.rehydrate();

    expect(usePaymentRecoveryStore.getState().activePaymentAttemptId).toBe(
      "b3000000-0000-4000-8000-000000000001",
    );
  });
});
