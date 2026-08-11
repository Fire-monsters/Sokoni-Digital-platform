import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export interface PesapalBrowserResult {
  outcome: "returned" | "cancelled" | "dismissed" | "error";
  paymentAttemptId?: string;
}

export async function openPesapalPayment(url: string): Promise<PesapalBrowserResult> {
  const returnUrl = Linking.createURL("payments/return");
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, {
      preferEphemeralSession: false,
      showInRecents: false,
    });
    if (result.type === "cancel") return { outcome: "cancelled" };
    if (result.type === "dismiss") return { outcome: "dismissed" };
    if (result.type !== "success") return { outcome: "error" };
    const parsed = Linking.parse(result.url);
    const paymentAttemptId = parsed.queryParams?.paymentAttemptId;
    const outcome = parsed.queryParams?.outcome;
    return {
      outcome: outcome === "cancelled" ? "cancelled" : "returned",
      ...(typeof paymentAttemptId === "string" ? { paymentAttemptId } : {}),
    };
  } catch {
    return { outcome: "error" };
  }
}
