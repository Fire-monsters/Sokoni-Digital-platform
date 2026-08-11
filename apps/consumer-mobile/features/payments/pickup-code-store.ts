import * as SecureStore from "expo-secure-store";

const key = (checkoutId: string) => `ekatale-pickup-code:${checkoutId}`;

export function savePickupCode(checkoutId: string, pickupCode: string): Promise<void> {
  return SecureStore.setItemAsync(key(checkoutId), pickupCode, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function getPickupCode(checkoutId: string): Promise<string | null> {
  return SecureStore.getItemAsync(key(checkoutId));
}

export function removePickupCode(checkoutId: string): Promise<void> {
  return SecureStore.deleteItemAsync(key(checkoutId));
}
