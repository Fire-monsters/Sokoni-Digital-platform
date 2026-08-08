import { describe, expect, it, vi } from "vitest";

import { PersistentOperationQueue, retryDelay, type QueueStorage } from "./index.js";

function memoryStorage(): QueueStorage {
  let value: string | null = null;
  return {
    getItem: vi.fn(() => Promise.resolve(value)),
    setItem: vi.fn((_key, nextValue) => {
      value = nextValue;
      return Promise.resolve();
    }),
  };
}

describe("PersistentOperationQueue", () => {
  it("deduplicates operation ids and removes successful work", async () => {
    const queue = new PersistentOperationQueue(memoryStorage(), "queue");
    await queue.hydrate();
    await queue.enqueue({ id: "same", kind: "availability", payload: { value: "available" } });
    await queue.enqueue({ id: "same", kind: "availability", payload: { value: "unavailable" } });
    expect(queue.snapshot()).toHaveLength(1);

    await queue.flush(() => Promise.resolve());
    expect(queue.snapshot()).toHaveLength(0);
  });

  it("retains failed work with exponential retry metadata", async () => {
    const queue = new PersistentOperationQueue(memoryStorage(), "queue");
    await queue.hydrate();
    await queue.enqueue({ id: "one", kind: "upload", payload: {} });
    const now = Date.now();
    await queue.flush(() => Promise.reject(new Error("offline")), now);
    expect(queue.snapshot()[0]).toMatchObject({
      attempts: 1,
      status: "failed",
      nextAttemptAt: now + 1_000,
      lastError: "offline",
    });
  });
});

describe("retryDelay", () => {
  it("backs off and caps retries", () => {
    expect(retryDelay(1)).toBe(1_000);
    expect(retryDelay(4)).toBe(8_000);
    expect(retryDelay(20)).toBe(60_000);
  });
});
