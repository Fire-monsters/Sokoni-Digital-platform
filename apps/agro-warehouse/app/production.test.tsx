import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Page from "./page";
import * as wholesale from "../lib/wholesale-client";
import * as legacy from "../lib/warehouse-service";
vi.mock("../lib/api", () => ({ frontendConfig: { demoEnabled: false, apiUrl: "" } }));
it("production does not show invented operational records or intake forms", () => {
  const html = renderToStaticMarkup(<Page />);
  expect(html).toContain("Not connected yet");
  expect(html).not.toMatch(/Mariam|8,420|Intake recorded|Confirm intake|Offer sent/);
});
it("all wholesale demo actions and reads are unavailable in production", async () => {
  for (const fn of Object.values(wholesale)) {
    await expect((fn as (...args: unknown[]) => Promise<unknown>)()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  }
});
it("legacy demo mutation helpers cannot report success", async () => {
  for (const run of [
    () => legacy.updateListingStatus("id", "approved"),
    legacy.createDemoOrder,
    legacy.resetDemo,
    legacy.loadDashboard,
    legacy.getWarehouseSnapshot,
    legacy.resetDemoData,
  ]) {
    const success = vi.fn();
    await expect(run().then(success)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(success).not.toHaveBeenCalled();
  }
});

it("legacy synchronous demo commands cannot claim persisted operations", () => {
  const commands = [
    () => legacy.acceptListing("id"),
    () => legacy.createPurchaseOrder("beans", 10),
    () => legacy.receiveProduce(10, 10, "A"),
    () =>
      legacy.publishAvailability({
        commodity: "beans",
        grade: "A",
        quantity: 10,
        zone: "A",
        days: 1,
        reorder: 1,
        value: 100,
      }),
    () => legacy.reserveStock(10, 1),
    () => legacy.dispatchOrder(10, 1),
  ];
  for (const run of commands) {
    expect(run).toThrow(expect.objectContaining({ code: "UNAVAILABLE" }));
  }
});
