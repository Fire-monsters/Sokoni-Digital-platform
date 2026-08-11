import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { ServerCart } from "./cart-store";
import { publicApiOptions } from "@/lib/api";

const installationKey = "ekatale.installation-id";
const guestTokenKey = "ekatale.guest-cart-token";

export async function getGuestCredentials() {
  let installationId = await SecureStore.getItemAsync(installationKey);
  let guestToken = await SecureStore.getItemAsync(guestTokenKey);
  if (!installationId) {
    installationId = Crypto.randomUUID();
    await SecureStore.setItemAsync(installationKey, installationId);
  }
  if (!guestToken) {
    guestToken = Array.from(await Crypto.getRandomBytesAsync(32), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    await SecureStore.setItemAsync(guestTokenKey, guestToken);
  }
  return { installationId, guestToken };
}

async function api<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  const credentials = await getGuestCredentials();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-installation-id", credentials.installationId);
  headers.set("x-guest-cart-token", credentials.guestToken);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${publicApiOptions.baseUrl}${path}`, { ...init, headers });
  const payload = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: { message: string };
  };
  if (!response.ok || !payload.success || !payload.data)
    throw new Error(payload.error?.message ?? "Cart request failed.");
  return payload.data;
}

export const createGuestCart = (marketId: string) =>
  api<ServerCart>("/v1/carts/guest", { method: "POST", body: JSON.stringify({ marketId }) });
export const putCartItem = (
  cartId: string,
  listingId: string,
  quantity: number,
  operationId: string,
  accessToken?: string,
) =>
  api<ServerCart>(
    "/v1/carts/current/items",
    { method: "POST", body: JSON.stringify({ cartId, listingId, quantity, operationId }) },
    accessToken,
  );
export const mergeGuestCart = (guestCartId: string, accessToken: string) =>
  api<{ cart: ServerCart; adjustments: Array<{ message: string }> }>(
    "/v1/carts/merge",
    { method: "POST", body: JSON.stringify({ guestCartId }) },
    accessToken,
  );
export async function deleteGuestCredentials() {
  await SecureStore.deleteItemAsync(guestTokenKey);
}
