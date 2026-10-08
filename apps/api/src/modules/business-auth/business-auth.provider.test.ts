import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBusinessAuthProvider } from "./business-auth.provider.js";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), parse: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../../config/index.js", () => ({ parseServerEnvironment: mocks.parse }));
function setup() {
  const session = {
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 123,
    user: { id: "user", phone_confirmed_at: "2026-10-02" },
  };
  const result = { data: { session }, error: null };
  const auth = {
    signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    resend: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue(result),
    signInWithPassword: vi.fn().mockResolvedValue(result),
    refreshSession: vi.fn().mockResolvedValue(result),
    admin: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  };
  mocks.createClient.mockReturnValue({ auth });
  return { auth, provider: createBusinessAuthProvider() };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parse.mockReturnValue({
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    SUPABASE_SECRET_KEY: "never-use-for-user-session",
  });
});
describe("Supabase business auth adapter", () => {
  it("creates isolated public-key clients with session persistence disabled", () => {
    setup();
    createBusinessAuthProvider();
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledWith("http://localhost:54321", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
  it("uses provider registration and SMS verification, not fabricated tokens", async () => {
    const { auth, provider } = setup();
    await provider.register("+256772123456", "Password123");
    expect(auth.signUp).toHaveBeenCalledWith({ phone: "+256772123456", password: "Password123" });
    expect(await provider.verify("+256772123456", "123456")).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
      userId: "user",
      phoneVerified: true,
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: "+256772123456",
      token: "123456",
      type: "sms",
    });
  });
  it("propagates invalid OTP without provider error details", async () => {
    const { auth, provider } = setup();
    auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { status: 403, message: "secret internal error" },
    });
    await expect(provider.verify("+256772123456", "111111")).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  });
  it.each(["phone_provider_disabled", "signup_disabled"])(
    "reports %s as a configuration failure rather than invalid credentials",
    async (code) => {
      const { auth, provider } = setup();
      auth.signUp.mockResolvedValue({
        data: { session: null },
        error: { status: 400, code, message: "internal provider details" },
      });
      await expect(provider.register("+256772123456", "Password123")).rejects.toMatchObject({
        statusCode: 503,
        code: "INTERNAL_ERROR",
        message: "Phone registration is unavailable. Contact support.",
      });
    },
  );
  it("requires a phone-confirmed session even on a provider success", async () => {
    const { auth, provider } = setup();
    auth.signInWithPassword.mockResolvedValue({
      data: { session: { user: { id: "user" } } },
      error: null,
    });
    await expect(provider.login("+256772123456", "Password123")).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it("flags incorrectly configured auto-confirm registration", async () => {
    const { auth, provider } = setup();
    auth.signUp.mockResolvedValue({
      data: { session: { access_token: "unexpected" } },
      error: null,
    });
    await expect(provider.register("+256772123456", "Password123")).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it("resends, refreshes and revokes through Supabase", async () => {
    const { auth, provider } = setup();
    await provider.resend("+256772123456");
    await provider.refresh("refresh");
    await provider.logout("access");
    expect(auth.resend).toHaveBeenCalledWith({ type: "sms", phone: "+256772123456" });
    expect(auth.refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh" });
    expect(auth.admin.signOut).toHaveBeenCalledWith("access", "local");
  });
});
