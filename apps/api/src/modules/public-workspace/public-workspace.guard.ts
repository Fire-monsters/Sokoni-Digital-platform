import type { NextFunction, Request, Response } from "express";
import { getPublicWorkspaceConfig, parseServerEnvironment } from "../../config/index.js";
import { sendError } from "../../http/responses.js";
import { supabase } from "../../infrastructure/supabase/client.js";
import "./public-workspace.types.js";

const FORBIDDEN_CLIENT_KEYS = new Set([
  "staffid",
  "staff_id",
  "workspaceidentity",
  "businessscope",
  "permissionset",
  "actorid",
  "actor_id",
  "actor",
  "warehouseid",
  "warehouse_id",
  "businessid",
  "business_id",
  "role",
  "roles",
  "permission",
  "permissions",
  "workspace",
]);

function containsForbiddenKeys(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (FORBIDDEN_CLIENT_KEYS.has(key.toLowerCase()) || containsForbiddenKeys((obj as Record<string, unknown>)[key])) {
      return true;
    }
  }
  return false;
}

export interface PublicWorkspaceValidator {
  validateOperationsActor?(actorId: string): Promise<boolean>;
  validateWarehouseScope?(actorId: string, warehouseId: string): Promise<boolean>;
}

export class SupabasePublicWorkspaceValidator implements PublicWorkspaceValidator {
  async validateOperationsActor(actorId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("staff_members")
      .select("user_id, status")
      .eq("user_id", actorId)
      .maybeSingle();

    if (error || !data) return false;
    return data.status === "active";
  }

  async validateWarehouseScope(actorId: string, warehouseId: string): Promise<boolean> {
    const { data: warehouse, error: whError } = await supabase
      .from("businesses")
      .select("id, kind, status")
      .eq("id", warehouseId)
      .eq("kind", "warehouse")
      .maybeSingle();

    if (whError || !warehouse || warehouse.status !== "approved") {
      return false;
    }

    const { data: membership, error: memError } = await supabase
      .from("business_memberships")
      .select("business_id, user_id, active")
      .eq("business_id", warehouseId)
      .eq("user_id", actorId)
      .eq("active", true)
      .maybeSingle();

    if (memError || !membership) {
      return false;
    }

    return true;
  }
}

export interface PublicWorkspaceGuardOptions {
  validator?: PublicWorkspaceValidator;
  skipDbCheck?: boolean;
}

export function requirePublicWorkspace(
  kind: "operations" | "warehouse",
  options: PublicWorkspaceGuardOptions = {},
) {
  const validator = options.validator ?? new SupabasePublicWorkspaceValidator();

  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    let env;
    try {
      env = parseServerEnvironment();
    } catch {
      sendError(
        request,
        response,
        503,
        "PUBLIC_WORKSPACE_MISCONFIGURED",
        "Server environment configuration is invalid.",
      );
      return;
    }

    const config = getPublicWorkspaceConfig(env);

    // 1. Feature flag check
    if (kind === "operations" && !config.operationsEnabled) {
      sendError(
        request,
        response,
        403,
        "PUBLIC_WORKSPACE_DISABLED",
        "Public operations workspace is currently disabled.",
      );
      return;
    }

    if (kind === "warehouse" && !config.warehouseEnabled) {
      sendError(
        request,
        response,
        403,
        "PUBLIC_WORKSPACE_DISABLED",
        "Public warehouse workspace is currently disabled.",
      );
      return;
    }

    // 2. Strict rejection of client identity/scope injection
    if (containsForbiddenKeys(request.body) || containsForbiddenKeys(request.query)) {
      sendError(
        request,
        response,
        400,
        "VALIDATION_ERROR",
        "Public workspace requests cannot specify actor, warehouse, or role overrides.",
      );
      return;
    }

    // 3. Configuration identity validation
    if (kind === "operations") {
      if (!config.operationsActorId) {
        sendError(
          request,
          response,
          503,
          "PUBLIC_WORKSPACE_MISCONFIGURED",
          "Public operations workspace actor ID is not configured.",
        );
        return;
      }

      if (!options.skipDbCheck && validator.validateOperationsActor) {
        const isValid = await validator.validateOperationsActor(config.operationsActorId);
        if (!isValid) {
          sendError(
            request,
            response,
            403,
            "PUBLIC_WORKSPACE_MISCONFIGURED",
            "Configured operations workspace actor is not active or authorized.",
          );
          return;
        }
      }

      // 4. Inject trusted server-configured context
      delete (request as Request & { auth?: unknown }).auth;
      request.publicWorkspace = {
        kind: "operations",
        actorId: config.operationsActorId,
      };
      next();
      return;
    }

    if (kind === "warehouse") {
      if (!config.warehouseActorId || !config.warehouseId) {
        sendError(
          request,
          response,
          503,
          "PUBLIC_WORKSPACE_MISCONFIGURED",
          "Public warehouse workspace actor or warehouse ID is not configured.",
        );
        return;
      }

      if (!options.skipDbCheck && validator.validateWarehouseScope) {
        const isScoped = await validator.validateWarehouseScope(
          config.warehouseActorId,
          config.warehouseId,
        );
        if (!isScoped) {
          sendError(
            request,
            response,
            403,
            "WAREHOUSE_SCOPE_INVALID",
            "Configured warehouse workspace actor is not scoped to the configured warehouse.",
          );
          return;
        }
      }

      // 4. Inject trusted server-configured context
      delete (request as Request & { auth?: unknown }).auth;
      request.publicWorkspace = {
        kind: "warehouse",
        actorId: config.warehouseActorId,
        warehouseId: config.warehouseId,
      };
      next();
      return;
    }

    next();
  };
}
