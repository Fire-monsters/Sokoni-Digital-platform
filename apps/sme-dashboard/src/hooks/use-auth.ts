import { useEffect, useSyncExternalStore } from "react";
import type { AuthState } from "@/models/auth";
import { businessAuth } from "@/services/business-auth";

const serverSnapshot: AuthState = { status: "loading" };
export function useAuth() {
  return useSyncExternalStore(
    businessAuth.subscribe,
    businessAuth.getSnapshot,
    () => serverSnapshot,
  );
}

export function useAuthLifecycle() {
  const state = useAuth();
  useEffect(() => {
    void businessAuth.initialize();
  }, []);
  useEffect(() => {
    if (state.status !== "authenticated") return;
    const expiresAt = state.session.expiresAt;
    const delay =
      expiresAt === null ? 60_000 : Math.max(1_000, expiresAt * 1000 - Date.now() - 60_000);
    const timer = window.setTimeout(
      () => {
        void businessAuth.refresh();
      },
      Math.min(delay, 2_147_483_647),
    );
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        (expiresAt === null || expiresAt * 1000 <= Date.now() + 60_000)
      )
        void businessAuth.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state]);
  return state;
}
