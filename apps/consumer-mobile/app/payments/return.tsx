import { Redirect, useLocalSearchParams } from "expo-router";

export default function PaymentReturnScreen() {
  const params = useLocalSearchParams<{
    paymentAttemptId?: string;
    outcome?: string;
  }>();
  if (!params.paymentAttemptId) {
    return (
      <Redirect
        href={{
          pathname: "/payments/error",
          params: { reason: params.outcome ?? "invalid_return" },
        }}
      />
    );
  }
  if (params.outcome === "cancelled") {
    return (
      <Redirect
        href={{
          pathname: "/payments/cancelled",
          params: { paymentAttemptId: params.paymentAttemptId },
        }}
      />
    );
  }
  return (
    <Redirect
      href={{
        pathname: "/payments/[paymentAttemptId]",
        params: { paymentAttemptId: params.paymentAttemptId },
      }}
    />
  );
}
