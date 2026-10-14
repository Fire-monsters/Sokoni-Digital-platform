import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  ApiError,
  apiErrorMessage,
  createApiClient,
  createFrontendConfig,
  shouldRetryRead,
  unavailable,
} from "./transport";
const api = createApiClient({ baseUrl: "https://api.example/", accessToken: "token" });
function respond(body: string | null, status = 200, headers: Record<string, string> = {}) {
  const mock = vi.fn().mockResolvedValue(new Response(body, { status, headers }));
  vi.stubGlobal("fetch", mock);
  return mock;
}
afterEach(() => vi.unstubAllGlobals());
describe("typed API transport", () => {
  it.each(["get", "post", "patch", "delete"] as const)(
    "supports %s with real HTTP success statuses",
    async (method) => {
      const fetcher = respond(
        JSON.stringify({ success: true, data: { id: "saved" }, meta: { requestId: "r1" } }),
        201,
      );
      const metadata = vi.fn();
      const result =
        method === "post" || method === "patch"
          ? await api[method]<{ id: string }, { name: string }>(
              "/items",
              { name: "beans" },
              { onResponse: metadata },
            )
          : await api[method]<{ id: string }>("/items", { onResponse: metadata });
      expect(result.id).toBe("saved");
      expect(fetcher).toHaveBeenCalledWith(
        "https://api.example/items",
        expect.objectContaining({ method: method.toUpperCase() }),
      );
      const init = fetcher.mock.calls[0]?.[1] as RequestInit;
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer token");
      if (method === "post" || method === "patch") expect(init.body).toBe('{"name":"beans"}');
      expect(metadata).toHaveBeenCalledWith({ status: 201, requestId: "r1" });
    },
  );
  it.each([204, 200, 202])("handles empty %s responses", async (status) => {
    respond(null, status);
    await expect(api.get<undefined>("/empty")).resolves.toBeUndefined();
  });
  it("supports explicit raw JSON contracts without adding an envelope", async () => {
    respond('{"ready":true}');
    expect(await createApiClient({ baseUrl: "", responseMode: "raw" }).get("/ready")).toEqual({
      ready: true,
    });
  });
  it.each([400, 401, 403, 404, 409, 422, 500, 503])(
    "preserves backend error at %s",
    async (status) => {
      respond(
        JSON.stringify({
          success: false,
          error: {
            code: "ACTION_NOT_AVAILABLE",
            message: "Action not available",
            requestId: "request-1",
            currentVersion: 4,
          },
        }),
        status,
      );
      await expect(api.get("/items")).rejects.toMatchObject({
        status,
        code: "ACTION_NOT_AVAILABLE",
        requestId: "request-1",
        currentVersion: 4,
        kind: "http",
      });
    },
  );
  it("handles flat errors, header IDs and safe user messages", async () => {
    respond('{"code":"UNAVAILABLE","message":"internal database detail"}', 503, {
      "x-request-id": "header-id",
    });
    const error = await api.get("/items").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).requestId).toBe("header-id");
    expect(apiErrorMessage(error)).toBe("This action is currently unavailable.");
    expect(shouldRetryRead(0, error)).toBe(false);
  });
  it.each(["<html>proxy failure</html>", "null", "{}"])(
    "handles unknown error body %s",
    async (body) => {
      respond(body, 500);
      await expect(api.get("/items")).rejects.toMatchObject({
        kind: "http",
        code: "HTTP_ERROR",
        status: 500,
      });
    },
  );
  it.each(["not json", "null", "{}", '{"success":true}'])(
    "rejects malformed success %s",
    async (body) => {
      respond(body);
      await expect(api.get("/items")).rejects.toMatchObject({ kind: "invalid-response" });
    },
  );
  it("never converts non-2xx success envelopes to success", async () => {
    respond('{"success":true,"data":{}}', 503);
    await expect(api.get("/items")).rejects.toMatchObject({ status: 503 });
  });
  it("distinguishes network and aborted requests and forwards the signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const failure = await api.get("/items").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).not.toBeInstanceOf(ApiClientError);
    expect(failure).toMatchObject({ kind: "network", code: "NETWORK_ERROR" });
    const controller = new AbortController();
    controller.abort();
    await expect(api.get("/items", { signal: controller.signal })).rejects.toMatchObject({
      kind: "aborted",
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
  it.each([400, 401, 403, 404, 409, 422, 500])("does not retry %s", (status) => {
    expect(
      shouldRetryRead(0, new ApiClientError(status, { code: "ERROR", message: "error" })),
    ).toBe(false);
  });
  it.each([502, 503, 504, 0])("bounds transient %s retries", (status) => {
    const error = new ApiClientError(
      status,
      { code: "ERROR", message: "error" },
      status ? "http" : "network",
    );
    expect([0, 1, 2].map((count) => shouldRetryRead(count, error))).toEqual([true, true, false]);
  });
  it("UNAVAILABLE never becomes completion", () => {
    const success = vi.fn();
    expect(() => {
      unavailable();
      success();
    }).toThrow(ApiClientError);
    expect(success).not.toHaveBeenCalled();
  });
  it("demo requires explicit non-production opt-in", () => {
    expect(createFrontendConfig({ production: false }).demoEnabled).toBe(false);
    expect(createFrontendConfig({ production: false, demo: "true" }).demoEnabled).toBe(true);
    expect(createFrontendConfig({ production: true, demo: "true" }).demoEnabled).toBe(false);
  });
});
