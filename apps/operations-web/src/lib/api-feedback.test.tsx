// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ApiFeedback } from "@sokoni-digital/api-client/react";
import { ApiClientError } from "@sokoni-digital/api-client";
it("renders safe errors and invokes the actual retry handler", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const retry = vi.fn();
  const error = new ApiClientError(503, {
    code: "UNAVAILABLE",
    message: "secret database detail",
    requestId: "request-2",
  });
  await act(async () => root.render(<ApiFeedback error={error} onRetry={retry} />));
  expect(host.textContent).toContain("This action is currently unavailable.");
  expect(host.textContent).toContain("request-2");
  expect(host.textContent).not.toContain("secret");
  await act(async () => host.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<ApiFeedback pending />));
  expect(host.textContent).toContain("Loading");
  await act(async () => root.render(<ApiFeedback refreshing />));
  expect(host.textContent).toContain("Refreshing");
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
