import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isConsumerAuthConfigured = Boolean(configuredUrl && configuredKey);
const url = configuredUrl ?? "http://127.0.0.1:54321";
const key = configuredKey ?? "sb_publishable_not_configured";

export const consumerSupabase = createClient(url, key, {
  auth: {
    ...(Platform.OS === "web" ? {} : { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") consumerSupabase.auth.startAutoRefresh();
    else consumerSupabase.auth.stopAutoRefresh();
  });
}
