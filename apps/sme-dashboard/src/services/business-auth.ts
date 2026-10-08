import { z } from "zod";
import type { AuthSession, AuthState, PendingVerification } from "@/models/auth";

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().nullable(),
  userId: z.string().min(1),
  phoneVerified: z.literal(true),
});
const pendingSchema = z.object({
  phoneNumber: z.string().regex(/^\+256(?:7[0-9]|3[0-9])[0-9]{7}$/),
  resendAt: z.number(),
});
const SESSION_KEY = "sokoni-sme-session";
const PENDING_KEY = "sokoni-sme-verification";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 60,
  ) {
    super(message);
  }
}

export function authErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function createBusinessAuthService(options: {
  baseUrl: string;
  fetcher?: typeof fetch;
  storage: () => Storage | undefined;
  now?: () => number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let state: AuthState = { status: "loading" };
  let session: AuthSession | null = null;
  let pending: PendingVerification | null = null;
  let initialized = false;
  let generation = 0;
  let refreshing: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  function emit(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function read(key: string): unknown {
    try {
      return JSON.parse(options.storage()?.getItem(key) ?? "null");
    } catch {
      return null;
    }
  }
  function save(key: string, value: unknown) {
    // Storage can be disabled. The current tab can still use an in-memory session.
    try {
      if (value === null) options.storage()?.removeItem(key);
      else options.storage()?.setItem(key, JSON.stringify(value));
    } catch {
      /* Keep the in-memory state. */
    }
  }
  async function request(action: string, body?: unknown, token?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/v1/business-auth/${action}`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new AuthError("Unable to connect. Check your connection and try again.", 0);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      const seconds = Number(response.headers.get("Retry-After"));
      const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
      const message =
        response.status === 429
          ? `Too many attempts. Try again in ${retryAfter} seconds.`
          : response.status === 401
            ? "Check your phone number, password or verification code and try again."
            : response.status === 503
              ? "Authentication is temporarily unavailable. Please try again later."
              : "We couldn't complete your request. Please try again.";
      throw new AuthError(message, response.status, retryAfter);
    }
    return result.data;
  }
  function accept(value: unknown) {
    const parsed = sessionSchema.safeParse(value);
    if (!parsed.success)
      throw new AuthError("We couldn't verify your session. Please log in again.", 401);
    session = parsed.data;
    save(SESSION_KEY, session);
    pending = null;
    save(PENDING_KEY, null);
    emit({ status: "authenticated", session });
  }
  function clear() {
    generation++;
    session = null;
    save(SESSION_KEY, null);
    pending = null;
    save(PENDING_KEY, null);
    emit({ status: "anonymous" });
  }
  async function refresh() {
    if (refreshing) return refreshing;
    if (!session) return;
    const current = generation;
    const token = session.refreshToken;
    refreshing = (async () => {
      try {
        const value = await request("refresh", { refreshToken: token });
        if (current === generation) accept(value);
      } catch (error) {
        if (current !== generation) return;
        if (error instanceof AuthError && error.status === 401) clear();
        else emit({ status: "error", message: authErrorMessage(error) });
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    getPending: () => pending,
    async initialize() {
      if (initialized) return;
      initialized = true;
      pending = pendingSchema.safeParse(read(PENDING_KEY)).data ?? null;
      session = sessionSchema.safeParse(read(SESSION_KEY)).data ?? null;
      if (!session) {
        emit({ status: "anonymous" });
        return;
      }
      // Always validate a restored session with the server and rotate its refresh token.
      await refresh();
    },
    refresh,
    async register(phoneNumber: string, password: string) {
      await request("register", { phoneNumber, password });
      pending = { phoneNumber, resendAt: now() + 60_000 };
      save(PENDING_KEY, pending);
    },
    async resend(phoneNumber: string) {
      try {
        await request("resend-otp", { phoneNumber });
        pending = { phoneNumber, resendAt: now() + 60_000 };
        save(PENDING_KEY, pending);
      } catch (error) {
        if (error instanceof AuthError && error.status === 429) {
          pending = { phoneNumber, resendAt: now() + error.retryAfter * 1000 };
          save(PENDING_KEY, pending);
        }
        throw error;
      }
    },
    async login(phoneNumber: string, password: string) {
      const current = ++generation;
      const value = await request("login", { phoneNumber, password });
      if (current === generation) accept(value);
    },
    async verify(phoneNumber: string, otpCode: string) {
      const current = ++generation;
      const value = await request("verify-otp", { phoneNumber, otpCode });
      if (current === generation) accept(value);
    },
    async logout() {
      // Wait for rotation so logout revokes the current refresh session.
      if (refreshing) await refreshing;
      if (session) await request("logout", undefined, session.accessToken);
      clear();
    },
  };
}

export const businessAuth = createBusinessAuthService({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  storage: () => (typeof window === "undefined" ? undefined : window.sessionStorage),
});
