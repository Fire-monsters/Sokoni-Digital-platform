// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
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
});
async function open(path: string) {
  window.history.replaceState({}, "", path);
  await act(async () => {
    root.render(<App />);
  });
}
describe("demo workspace access", () => {
  it.each(["/login", "/unauthorized"])(
    "redirects legacy %s without authentication",
    async (path) => {
      await open(path);
      expect(window.location.pathname).toBe("/dashboard/overview");
      expect(host.textContent).toContain("Demo mode — changes reset on reload.");
      expect(host.querySelector('input[type="password"]')).toBeNull();
    },
  );
  it.each([
    ["/dashboard/approvals/vendors", "Demo Produce Stall"],
    ["/dashboard/approvals/riders", "Demo Rider Applicant"],
    ["/dashboard/approvals/listings", "Beans"],
    ["/dashboard/approvals/price-changes", "4,500"],
    ["/dashboard/deliveries", "DEMO-DL-1"],
    ["/dashboard/payments", "DEMO-ORD-1"],
    ["/dashboard/orders/demo-order-1", "Demo Customer"],
    ["/dashboard/audit", "Demo operator"],
  ])("loads %s directly with sample data", async (path, text) => {
    await open(path);
    expect(host.textContent).toContain(text);
    expect(host.textContent).not.toContain("Something went wrong");
  });
});

it("keeps a local support note across navigation without sending a request", async () => {
  await open("/dashboard/orders/demo-order-1");
  const textareas = [...host.querySelectorAll("textarea")];
  const notes = textareas.find((element) => element.maxLength === 2000) ?? textareas[0];
  expect(notes).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      notes,
      "Demo note from mounted UI",
    );
    notes.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const button = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Add note"),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(host.textContent).toContain("Demo note from mounted UI");
  await act(async () => {
    window.history.pushState({}, "", "/dashboard/payments");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await act(async () => {
    window.history.pushState({}, "", "/dashboard/orders/demo-order-1");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(host.textContent).toContain("Demo note from mounted UI");
});
