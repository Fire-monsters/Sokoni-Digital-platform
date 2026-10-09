// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WholesaleWorkspace } from "./wholesale-workspace";
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected live request");
    }),
  );
  vi.stubEnv("NEXT_PUBLIC_WHOLESALE_ENABLED", "false");
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("open wholesale demo", () => {
  it.each(["Buyer orders", "Wholesale catalogue", "Finance"] as const)(
    "opens %s without the live flag or credentials",
    async (view) => {
      await act(async () => root.render(<WholesaleWorkspace view={view} />));
      expect(host.textContent).toContain("Demo mode — changes reset on reload.");
      expect(host.querySelector('input[type="password"]')).toBeNull();
      expect(host.textContent).not.toContain("Loading…");
      expect(host.textContent).not.toContain("Sign in");
    },
  );
  it("confirms a sample order and sees its invoice after switching to finance", async () => {
    await act(async () => root.render(<WholesaleWorkspace view="Buyer orders" />));
    const confirm = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Confirm exact terms",
    );
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    expect(host.textContent).toContain("Order DEMO-WH-1 confirmed.");
    const pdf = [...host.querySelectorAll("button")].find((b) => b.textContent === "PDF");
    expect(pdf?.disabled).toBe(true);
    await act(async () => root.render(<WholesaleWorkspace view="Finance" />));
    expect(host.textContent).toContain("DEMO-INV-demo-order-0");
    await act(async () => root.render(<WholesaleWorkspace view="Buyer orders" />));
    expect(
      [...host.querySelectorAll("button")].some((b) => b.textContent === "Confirm exact terms"),
    ).toBe(false);
  });
});
