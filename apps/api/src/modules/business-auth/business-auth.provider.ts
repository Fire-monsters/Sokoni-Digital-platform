import { createClient, type Session } from "@supabase/supabase-js";
import type { BusinessAuthSession } from "@sokoni-digital/domain";
import { parseServerEnvironment } from "../../config/index.js";

export interface BusinessAuthProvider {
  register(phone: string, password: string): Promise<void>;
  resend(phone: string): Promise<void>;
  verify(phone: string, token: string): Promise<BusinessAuthSession>;
  login(phone: string, password: string): Promise<BusinessAuthSession>;
  refresh(token: string): Promise<BusinessAuthSession>;
  logout(token: string): Promise<void>;
}
export function authProviderError(error: {
  status?: number | undefined;
  code?: string | undefined;
}): Error {
  const status = error.status ?? 503;
  if (error.code === "phone_provider_disabled" || error.code === "signup_disabled")
    return Object.assign(
      new Error("Phone registration is unavailable. Contact support."),
      { statusCode: 503, code: "INTERNAL_ERROR" },
    );
  if (status === 429)
    return Object.assign(new Error("Too many attempts. Please try again later."), {
      statusCode: 429,
      code: "RATE_LIMITED",
    });
  if (status >= 500)
    return Object.assign(new Error("Authentication provider unavailable. Please retry later."), {
      statusCode: 503,
      code: "INTERNAL_ERROR",
    });
  return Object.assign(
    new Error("Authentication failed. Check your credentials or verification code."),
    { statusCode: 401, code: "UNAUTHENTICATED" },
  );
}
function sessionResult(session: Session | null): BusinessAuthSession {
  if (!session?.user.phone_confirmed_at) throw authProviderError({ status: 401 });
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    userId: session.user.id,
    phoneVerified: true,
  };
}
export function createBusinessAuthProvider(): BusinessAuthProvider {
  const env = parseServerEnvironment();
  // New public-key client for every HTTP request: never share mutable user sessions.
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async register(phone, password) {
      const { data, error } = await client.auth.signUp({ phone, password });
      if (error) throw authProviderError(error);
      // Do not silently bypass OTP when the deployment has disabled confirmation.
      if (data.session)
        throw Object.assign(
          new Error("Phone confirmations must be enabled for business registration."),
          { statusCode: 503, code: "INTERNAL_ERROR" },
        );
    },
    async resend(phone) {
      const { error } = await client.auth.resend({ type: "sms", phone });
      if (error) throw authProviderError(error);
    },
    async verify(phone, token) {
      const { data, error } = await client.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw authProviderError(error);
      return sessionResult(data.session);
    },
    async login(phone, password) {
      const { data, error } = await client.auth.signInWithPassword({ phone, password });
      if (error) throw authProviderError(error);
      return sessionResult(data.session);
    },
    async refresh(refresh_token) {
      const { data, error } = await client.auth.refreshSession({ refresh_token });
      if (error) throw authProviderError(error);
      return sessionResult(data.session);
    },
    async logout(token) {
      const { error } = await client.auth.admin.signOut(token, "local");
      if (error) throw authProviderError(error);
    },
  };
}
