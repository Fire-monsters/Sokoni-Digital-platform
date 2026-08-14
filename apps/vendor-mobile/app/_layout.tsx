import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { vendorQueryClient, vendorQueryPersister } from "@/lib/query-client";

export const unstable_settings = {
  anchor: "(public)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <PersistQueryClientProvider
      client={vendorQueryClient}
      persistOptions={{
        persister: vendorQueryPersister,
        maxAge: 86_400_000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.queryKey[0] === "vendor" || query.queryKey[0] === "catalogue",
        },
      }}
    >
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(public)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(registration)" options={{ headerShown: false }} />
          <Stack.Screen name="(approval)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="listings/new" options={{ title: "New listing" }} />
          <Stack.Screen name="listings/[listingId]" options={{ title: "Listing" }} />
          <Stack.Screen name="orders/[sellerOrderId]" options={{ title: "Seller order" }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
