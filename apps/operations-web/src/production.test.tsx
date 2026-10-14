// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import * as service from "./demo/service";
import { ApiClientError } from "@sokoni-digital/api-client";
vi.mock("./lib/api", async () => {
  const { createApiClient } = await import("@sokoni-digital/api-client");
  return { frontendConfig: { demoEnabled: false, apiUrl: "" }, api: createApiClient({ baseUrl: "" }) };
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  "payments",
  "orders",
  "approvals/vendors",
  "approvals/listings",
  "deliveries",
  "audit",
])("requests persisted data without showing fixtures on production %s", async (path) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetchMock = vi.fn((url: RequestInfo | URL) => {
    void url;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", `/dashboard/${path}`);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<App />));
  expect(host.textContent).not.toMatch(/DEMO-ORD|Demo Customer|Demo Produce|Payment successful/);
  expect(fetchMock).toHaveBeenCalled();
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/public/operations/");
  await act(async () => root.unmount());
});
it("every demo service export rejects before reading or mutating fixtures in production", async () => {
  for (const [name, fn] of Object.entries(service)) {
    if (name === "DemoError") continue;
    const invoke = fn as (...args: unknown[]) => Promise<unknown>;
    await expect(invoke()).rejects.toMatchObject({ code: "UNAVAILABLE", kind: "unavailable" });
  }
});
it("disabled provider action cannot invoke a success callback", async () => {
  const success = vi.fn();
  await expect(
    service.recheckPayment("demo-payment-0", "op", 1, "reason").then(success),
  ).rejects.toBeInstanceOf(ApiClientError);
  expect(success).not.toHaveBeenCalled();
});
