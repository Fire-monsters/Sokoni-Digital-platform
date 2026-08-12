import { afterEach, describe, expect, it, vi } from "vitest";

import { expireRiderOffers } from "./expire-rider-offers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("expireRiderOffers", () => {
  it("forwards the configured batch size and reports expired work", async () => {
    const expireOffers = vi.fn().mockResolvedValue(3);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(expireRiderOffers({ expireOffers }, 75)).resolves.toBe(3);
    expect(expireOffers).toHaveBeenCalledWith(75);
    expect(console.info).toHaveBeenCalledWith(
      JSON.stringify({ event: "delivery_offers.expired", count: 3 }),
    );
  });

  it("contains scheduler failures so the worker can run again", async () => {
    const expireOffers = vi.fn().mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(expireRiderOffers({ expireOffers }, 100)).resolves.toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({
        event: "delivery_offers.expiry_failed",
        error: "database unavailable",
      }),
    );
  });
});
