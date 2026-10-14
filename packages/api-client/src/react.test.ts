import { describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import { apiMutationOptions, createFrontendQueryClient } from "./react";
import { unavailable, ApiClientError } from "./transport";
describe("shared query and mutation policy", () => {
  it("refetches active persisted data after a successful mutation", async () => {
    const client = createFrontendQueryClient();
    let persisted = 1;
    const read = vi.fn(() => Promise.resolve(persisted));
    const observer = new QueryObserver(client, { queryKey: ["items"], queryFn: read });
    const stop = observer.subscribe(() => undefined);
    await observer.refetch();
    const mutation = client.getMutationCache().build(
      client,
      apiMutationOptions(client, {
        mutationFn: (value: number) => {
          persisted = value;
          return Promise.resolve(value);
        },
        invalidate: [["items"]],
      }),
    );
    await mutation.execute(2);
    expect(client.getQueryData(["items"])).toBe(2);
    expect(read.mock.calls.length).toBeGreaterThan(1);
    stop();
    client.clear();
  });
  it("does not retry or run success/invalidation for unavailable mutations", async () => {
    const client = createFrontendQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const fn = vi.fn(() => Promise.resolve().then(() => unavailable()));
    const mutation = client
      .getMutationCache()
      .build(client, apiMutationOptions(client, { mutationFn: fn, invalidate: [["items"]] }));
    await expect(mutation.execute(undefined)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    client.clear();
  });
  it("refetches current persisted state after a version conflict", async () => {
    const client = createFrontendQueryClient();
    let persisted = 2;
    const observer = new QueryObserver(client, { queryKey: ["record"], queryFn: () => Promise.resolve(persisted) });
    const stop = observer.subscribe(() => undefined);
    await observer.refetch();
    persisted = 3;
    const mutation = client.getMutationCache().build(client, apiMutationOptions(client, {
      mutationFn: () => Promise.reject(new ApiClientError(409, { code: "VERSION_CONFLICT", message: "Changed" })),
      invalidate: [["record"]],
    }));
    await expect(mutation.execute(undefined)).rejects.toMatchObject({ status: 409 });
    expect(client.getQueryData(["record"])).toBe(3);
    stop(); client.clear();
  });
  it("retries transient reads twice, supports manual retry and never retries unsafe errors", async () => {
    const client = createFrontendQueryClient();
    const transient = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError(503, { code: "TEMPORARY", message: "down" }))
      .mockResolvedValue("ok");
    expect(
      await client.fetchQuery({ queryKey: ["retry"], queryFn: transient, retryDelay: 0 }),
    ).toBe("ok");
    expect(transient).toHaveBeenCalledTimes(2);
    const unsafe = vi
      .fn()
      .mockRejectedValue(new ApiClientError(403, { code: "FORBIDDEN", message: "no" }));
    await expect(
      client.fetchQuery({ queryKey: ["unsafe"], queryFn: unsafe, retryDelay: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(unsafe).toHaveBeenCalledTimes(1);
    unsafe.mockResolvedValue("recovered");
    expect(await client.fetchQuery({ queryKey: ["unsafe"], queryFn: unsafe })).toBe("recovered");
    client.clear();
  });
});
