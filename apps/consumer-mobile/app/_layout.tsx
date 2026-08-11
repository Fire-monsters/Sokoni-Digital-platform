import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "react-native-reanimated";
import { useEffect } from "react";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { consumerQueryClient, consumerQueryPersister } from "@/lib/query-client";
import { ConsumerAuthProvider, useConsumerAuth } from "@/features/auth/auth-provider";
import { usePaymentRecoveryStore } from "@/features/payments/payment-store";

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
      <ConsumerAuthProvider>
        <PaymentRecoveryRedirect />
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="categories/[categoryId]" options={{ title: "Category" }} />
            <Stack.Screen name="listings/[listingId]" options={{ title: "Product details" }} />
            <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
            <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
            <Stack.Screen name="payments/[paymentAttemptId]" options={{ title: "Payment" }} />
            <Stack.Screen name="payments/return" options={{ headerShown: false }} />
            <Stack.Screen name="payments/cancelled" options={{ title: "Payment" }} />
            <Stack.Screen name="payments/error" options={{ title: "Payment" }} />
            <Stack.Screen name="orders/[checkoutId]" options={{ title: "Order progress" }} />
            <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ConsumerAuthProvider>
    </PersistQueryClientProvider>
  );
}

function PaymentRecoveryRedirect() {
  const { session, loading } = useConsumerAuth();
  const activePaymentAttemptId = usePaymentRecoveryStore((state) => state.activePaymentAttemptId);
  const pathname = usePathname();
  useEffect(() => {
    if (loading || !session || !activePaymentAttemptId || pathname.startsWith("/payments/")) return;
    router.replace({
      pathname: "/payments/[paymentAttemptId]",
      params: { paymentAttemptId: activePaymentAttemptId },
    });
  }, [activePaymentAttemptId, loading, pathname, session]);
  return null;
}
