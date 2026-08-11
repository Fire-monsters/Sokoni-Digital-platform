import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { consumerSupabase, isConsumerAuthConfigured } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  sendPhoneOtp(phone: string): Promise<void>;
  verifyPhoneOtp(phone: string, token: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function ConsumerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void consumerSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = consumerSupabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async sendPhoneOtp(phone) {
        if (!isConsumerAuthConfigured)
          throw new Error("Supabase Auth is not configured for this build.");
        const { error } = await consumerSupabase.auth.signInWithOtp({ phone });
        if (error) throw error;
      },
      async verifyPhoneOtp(phone, token) {
        if (!isConsumerAuthConfigured)
          throw new Error("Supabase Auth is not configured for this build.");
        const { error } = await consumerSupabase.auth.verifyOtp({ phone, token, type: "sms" });
        if (error) throw error;
      },

      async signInWithGoogle() {
        if (!isConsumerAuthConfigured)
          throw new Error("Supabase Auth is not configured for this build.");
        const redirectTo = Linking.createURL("auth/callback");
        const { data, error } = await consumerSupabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success") return;
        const fragment = result.url.split("#")[1] ?? result.url.split("?")[1] ?? "";
        const params = new URLSearchParams(fragment);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (!accessToken || !refreshToken)
          throw new Error("Google sign-in did not return a session.");
        const { error: sessionError } = await consumerSupabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      },
      async signOut() {
        const { error } = await consumerSupabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useConsumerAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("ConsumerAuthProvider is missing.");
  return value;
}
