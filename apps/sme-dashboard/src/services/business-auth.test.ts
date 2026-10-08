import { describe, expect, it, vi } from "vitest";
import { createBusinessAuthService } from "./business-auth";

const phoneNumber = "+256772123456";
const session = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: 2_000_000_000,
  userId: "owner-1",
  phoneVerified: true,
};
const success = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
const failure = (status: number, retryAfter?: string) =>
  new Response(JSON.stringify({ success: false, error: { message: "Provider internals" } }), {
    status,
    headers: retryAfter ? { "Retry-After": retryAfter } : {},
  });
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: () => null,
    length: 0,
  } satisfies Storage;
  const fetcher = vi.fn<typeof fetch>();
  const service = createBusinessAuthService({
    baseUrl: "https://api.example/",
    storage: () => storage,
    fetcher,
    now: () => 1000,
  });
  return { service, storage, values, fetcher };
}

describe("business auth service", () => {
  it("explains service outages without exposing backend internals", async () => {
    const { service, fetcher } = setup();
    await service.initialize();
    fetcher.mockResolvedValueOnce(failure(503));
    await expect(service.register(phoneNumber, "Produce123")).rejects.toMatchObject({
      status: 503,
      message: "Authentication is temporarily unavailable. Please try again later.",
    });
    expect(service.getSnapshot().status).toBe("anonymous");
    expect(service.getPending()).toBeNull();
  });
  it("registers without authenticating, and persists only phone/cooldown for OTP reloads", async () => {
    const { service, fetcher, values } = setup();
    await service.initialize();
    fetcher.mockResolvedValueOnce(success({ phoneVerificationRequired: true }));
    await service.register(phoneNumber, "Produce123");
    expect(service.getSnapshot().status).toBe("anonymous");
    expect(service.getPending()).toEqual({ phoneNumber, resendAt: 61000 });
    expect(JSON.stringify([...values])).not.toContain("Produce123");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example/v1/business-auth/register");
  });
  it("verification establishes a verified session and removes pending verification", async () => {
    const { service, fetcher, values } = setup();
    fetcher.mockResolvedValueOnce(success({})).mockResolvedValueOnce(success(session));
    await service.register(phoneNumber, "Produce123");
    await service.verify(phoneNumber, "123456");
    expect(service.getSnapshot()).toEqual({ status: "authenticated", session });
    expect(values.has("sokoni-sme-verification")).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({
      phoneNumber,
      otpCode: "123456",
    });
  });
  it("restores a session by rotating its token and deduplicates concurrent refreshes", async () => {
    const { service, storage, fetcher, values } = setup();
    storage.setItem("sokoni-sme-session", JSON.stringify(session));
    const rotated = { ...session, refreshToken: "refresh-2" };
    fetcher.mockResolvedValueOnce(success(rotated));
    await Promise.all([service.initialize(), service.refresh(), service.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({
      refreshToken: "refresh-1",
    });
    expect(JSON.parse(values.get("sokoni-sme-session")!).refreshToken).toBe("refresh-2");
  });
  it("clears an invalid restored session but lets transient network failures retry", async () => {
    const { service, storage, fetcher, values } = setup();
    storage.setItem("sokoni-sme-session", JSON.stringify(session));
    fetcher.mockRejectedValueOnce(new TypeError("offline"));
    await service.initialize();
    expect(service.getSnapshot().status).toBe("error");
    expect(values.has("sokoni-sme-session")).toBe(true);
    fetcher.mockResolvedValueOnce(failure(401));
    await service.refresh();
    expect(service.getSnapshot().status).toBe("anonymous");
    expect(values.has("sokoni-sme-session")).toBe(false);
  });
  it("respects the API resend retry delay", async () => {
    const { service, fetcher } = setup();
    fetcher.mockResolvedValueOnce(failure(429, "90"));
    await expect(service.resend(phoneNumber)).rejects.toMatchObject({
      status: 429,
      retryAfter: 90,
    });
    expect(service.getPending()?.resendAt).toBe(91000);
  });
  it("does not accept unverified or malformed sessions", async () => {
    const { service, fetcher } = setup();
    await service.initialize();
    fetcher.mockResolvedValueOnce(success({ ...session, phoneVerified: false }));
    await expect(service.login(phoneNumber, "Produce123")).rejects.toMatchObject({ status: 401 });
    expect(service.getSnapshot().status).toBe("anonymous");
  });
  it("retains the session if remote logout fails, then clears it after revocation", async () => {
    const { service, fetcher, values } = setup();
    fetcher
      .mockResolvedValueOnce(success(session))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(success({ signedOut: true }));
    await service.login(phoneNumber, "Produce123");
    await expect(service.logout()).rejects.toMatchObject({ status: 503 });
    expect(service.getSnapshot().status).toBe("authenticated");
    await service.logout();
    expect(service.getSnapshot().status).toBe("anonymous");
    expect(values.size).toBe(0);
    expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer access-1" });
    expect(fetcher.mock.calls[2][1]?.body).toBeUndefined();
  });
  it("handles corrupted or blocked browser storage without crashing", async () => {
    const { service, storage, fetcher } = setup();
    storage.setItem("sokoni-sme-session", "bad JSON");
    await service.initialize();
    expect(service.getSnapshot().status).toBe("anonymous");
    const blocked = createBusinessAuthService({
      baseUrl: "https://api.example",
      fetcher,
      storage: () => {
        throw new Error("Storage blocked");
      },
    });
    await blocked.initialize();
    fetcher.mockResolvedValueOnce(success(session));
    await blocked.login(phoneNumber, "Produce123");
    expect(blocked.getSnapshot().status).toBe("authenticated");
  });
});
