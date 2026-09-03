import { ApiClientError, fetchStaffSession } from "@sokoni-digital/api-client";
import type { StaffPermission, StaffSession } from "@sokoni-digital/domain";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authConfigurationError, operationsSupabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "authenticated"; session: Session; staff: StaffSession }
  | { status: "disabled"; message: string }
  | { status: "error"; message: string };

type AuthValue = {
  state: AuthState;
  accessToken?: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  can: (permission: StaffPermission) => boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    authConfigurationError
      ? { status: "error", message: authConfigurationError }
      : { status: "loading" },
  );
  const authorize = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ status: "guest" });
      return;
    }
    setState({ status: "loading" });
    try {
      const staff = await fetchStaffSession({ baseUrl: apiUrl, accessToken: session.access_token });
      setState({ status: "authenticated", session, staff });
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.code === "ACCOUNT_DISABLED" || error.statusCode === 403)
      ) {
        await operationsSupabase?.auth.signOut();
        setState({ status: "disabled", message: error.message });
        return;
      }
      if (error instanceof ApiClientError && error.statusCode === 401) {
        await operationsSupabase?.auth.signOut();
        setState({ status: "guest" });
        return;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Staff authorization failed.",
      });
    }
  }, []);
  useEffect(() => {
    if (!operationsSupabase) return;
    void operationsSupabase.auth.getSession().then(({ data }) => authorize(data.session));
    const {
      data: { subscription },
    } = operationsSupabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setState({ status: "guest" });
      else if (event === "TOKEN_REFRESHED") window.setTimeout(() => void authorize(session), 0);
    });
    return () => subscription.unsubscribe();
  }, [authorize]);
  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!operationsSupabase)
        throw new Error(authConfigurationError ?? "Authentication is unavailable.");
      const { data, error } = await operationsSupabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      await authorize(data.session);
    },
    [authorize],
  );

  const signOut = useCallback(async () => {
    const { error } = (await operationsSupabase?.auth.signOut()) ?? { error: null };
    if (error) throw new Error(error.message);
    setState({ status: "guest" });
  }, []);
  const refreshSession = useCallback(async () => {
    if (!operationsSupabase) return;
    const { data, error } = await operationsSupabase.auth.refreshSession();
    if (error) {
      setState({ status: "guest" });
      return;
    }
    await authorize(data.session);
  }, [authorize]);
  const value = useMemo(
    () => ({
      state,
      accessToken: state.status === "authenticated" ? state.session.access_token : undefined,
      signIn,
      signOut,
      refreshSession,
      can: (permission: StaffPermission) =>
        state.status === "authenticated" && state.staff.permissions.includes(permission),
    }),
    [state, signIn, signOut, refreshSession],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
// Provider and consumer hook intentionally share one cohesive module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
