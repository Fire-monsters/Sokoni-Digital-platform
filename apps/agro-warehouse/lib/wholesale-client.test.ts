import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network call");
    }),
  );
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://live.invalid");
  vi.stubEnv("NEXT_PUBLIC_WHOLESALE_ENABLED", "true");
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("warehouse demo", () => {
  it("confirms orders and shares simulated invoice payments across views", async () => {
    const s = await import("./wholesale-client");
    const warehouse = await s.demoWarehouse();
    const order = (await s.orders(warehouse.id))[0];
    await s.decideOrder(order.id, "confirm");
    const invoice = (await s.financeInvoices()).find((i) => i.orderId === order.id)!;
    await s.allocatePayment(invoice.id, 1000, "DEMO-REF");
    expect((await s.orders(warehouse.id))[0].invoice?.balanceUgx).toBe(299000);
    await expect(s.allocatePayment(invoice.id, 1000, "DEMO-REF")).rejects.toThrow("unique");
    await expect(s.allocatePayment(invoice.id, 999999, "DEMO-OVER")).rejects.toThrow("balance");
  });
  it("edits catalogue locally and resets on reload", async () => {
    let s = await import("./wholesale-client");
    const warehouse = await s.demoWarehouse();
    const offer = (await s.catalogue(warehouse.id))[0];
    await s.saveOffer(offer.id, {
      productId: offer.product_id,
      sku: offer.sku,
      name: "Updated demo beans",
      grade: "A",
      packageUnit: "bag",
      baseUnit: "kg",
      unitsPerPackage: 50,
      priceUgxPerPackage: 170000,
      minimumPackages: 1,
      availablePackages: 20,
      status: "published",
      expectedVersion: offer.version,
    });
    expect((await s.catalogue(warehouse.id))[0].name).toBe("Updated demo beans");
    vi.resetModules();
    s = await import("./wholesale-client");
    expect((await s.catalogue(warehouse.id))[0].name).toBe("Demo beans");
  });
});
