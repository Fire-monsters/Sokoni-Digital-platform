import type { NextFunction, Request, Response } from "express";

import { sendError } from "../http/responses.js";
import { supabase } from "../infrastructure/supabase/client.js";
import type { StaffAuthorization } from "../modules/staff/staff-authorization.repository.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        roles: string[];
        staff?: StaffAuthorization;
      };
    }
  }
}

export async function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  if (!token) {
    sendError(request, response, 401, "UNAUTHENTICATED", "A valid bearer token is required.");
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    sendError(request, response, 401, "UNAUTHENTICATED", "The bearer token is invalid or expired.");
    return;
  }

  const metadata = data.user.app_metadata as Record<string, unknown>;
  const roles: string[] = [];
  if (typeof metadata.role === "string") roles.push(metadata.role);
  const metadataRoles: unknown = metadata.roles;
  if (Array.isArray(metadataRoles)) {
    for (const role of metadataRoles as unknown[]) {
      if (typeof role === "string") roles.push(role);
    }
  }
  const { data: sellerAccount } = await supabase
    .from("seller_accounts")
    .select("seller_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (sellerAccount && !roles.includes("vendor")) roles.push("vendor");
  const { data: transporterProfile } = await supabase
    .from("transporter_profiles")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (transporterProfile && !roles.includes("rider")) roles.push("rider");

  request.auth = {
    userId: data.user.id,
    roles,
  };
  next();
}
