import { createHash } from "node:crypto";
import type { Request } from "express";

import { supabase } from "../../infrastructure/supabase/client.js";
import type { CartOwner } from "./cart.types.js";

export class CartAuthenticationError extends Error {
  readonly statusCode = 401;
  readonly code = "UNAUTHENTICATED";
}

export class GuestCartCredentialsError extends Error {
  readonly statusCode = 400;
  readonly code = "GUEST_CART_CREDENTIALS_REQUIRED";
}

function guestOwner(request: Request): CartOwner {
  const token = request.header("x-guest-cart-token");
  const installationId = request.header("x-installation-id");
  if (!token || token.length < 32 || !installationId || !/^[0-9a-f-]{36}$/i.test(installationId)) {
    throw new GuestCartCredentialsError(
      "X-Guest-Cart-Token (at least 32 characters) and a valid X-Installation-ID are required.",
    );
  }
  return {
    consumerId: null,
    guestTokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
    installationId,
  };
}

export async function resolveCartOwner(request: Request): Promise<CartOwner> {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return guestOwner(request);
  const { data, error } = await supabase.auth.getUser(authorization.slice(7).trim());
  if (error) throw new CartAuthenticationError("The bearer token is invalid or expired.");
  return { consumerId: data.user.id, guestTokenHash: null, installationId: null };
}

export function resolveGuestOwner(request: Request): CartOwner {
  return guestOwner(request);
}
