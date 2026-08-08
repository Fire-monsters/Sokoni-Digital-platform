import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const secureStorage = {
  getItem: (key: string) =>
    Platform.OS === "web" ? Promise.resolve(null) : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web" ? Promise.resolve() : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === "web" ? Promise.resolve() : SecureStore.deleteItemAsync(key),
};

export const mobileSupabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  {
    auth: {
      storage: secureStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
