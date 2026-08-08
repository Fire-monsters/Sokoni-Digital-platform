import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { consumerQueryClient, consumerQueryPersister } from "@/lib/query-client";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <PersistQueryClientProvider
      client={consumerQueryClient}
      persistOptions={{
        persister: consumerQueryPersister,
        maxAge: 86_400_000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.queryKey[0] === "catalogue",
        },
      }}
    >
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="categories/[categoryId]" options={{ title: "Category" }} />
          <Stack.Screen name="listings/[listingId]" options={{ title: "Product details" }} />
          <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
