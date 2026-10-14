import { parseServerEnvironment, getPublicWorkspaceConfig } from "../../config/index.js";
import { supabase } from "../../infrastructure/supabase/client.js";

export type ReadinessCheckStatus = "ok" | "disabled" | "failed";

export interface ReadinessResult {
  ready: boolean;
  status: "ready" | "not_ready";
  checks: {
    database: ReadinessCheckStatus;
    operationsWorkspace: ReadinessCheckStatus;
    warehouseWorkspace: ReadinessCheckStatus;
  };
  errors?: string[];
}

export interface ReadinessDependencies {
  checkDatabase?: () => Promise<boolean>;
  validateOperationsActor?: (actorId: string) => Promise<boolean>;
  validateWarehouseScope?: (actorId: string, warehouseId: string) => Promise<boolean>;
  env?: ReturnType<typeof parseServerEnvironment>;
}

export async function checkReadiness(
  deps: ReadinessDependencies = {},
): Promise<ReadinessResult> {
  const errors: string[] = [];
  let isReady = true;

  let env = deps.env;
  if (!env) {
    try {
      env = parseServerEnvironment();
    } catch {
      return {
        ready: false,
        status: "not_ready",
        checks: {
          database: "failed",
          operationsWorkspace: "failed",
          warehouseWorkspace: "failed",
        },
        errors: ["Server environment configuration validation failed."],
      };
    }
  }

  // 1. Privileged server configuration exists server-side
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    errors.push("Missing privileged Supabase server credentials.");
    isReady = false;
  }

  // 2. Database readiness check
  let dbStatus: ReadinessCheckStatus = "ok";
  const checkDatabase =
    deps.checkDatabase ??
    (async () => {
      try {
        const { error } = await supabase
          .rpc("list_product_categories")
          .abortSignal(AbortSignal.timeout(5000));
        return !error;
      } catch {
        return false;
      }
    });

  const dbOk = await checkDatabase();
  if (!dbOk) {
    dbStatus = "failed";
    errors.push("Database ping failed.");
    isReady = false;
  }

  const workspaceConfig = getPublicWorkspaceConfig(env);

  // 3. Operations Workspace readiness
  let operationsStatus: ReadinessCheckStatus = "disabled";
  if (workspaceConfig.operationsEnabled) {
    if (!workspaceConfig.operationsActorId) {
      operationsStatus = "failed";
      errors.push("PUBLIC_OPERATIONS_ENABLED is true but OPERATIONS_WORKSPACE_ACTOR_ID is missing.");
      isReady = false;
    } else {
      const validateOperationsActor =
        deps.validateOperationsActor ??
        (async (actorId: string) => {
          const { data, error } = await supabase
            .from("staff_members")
            .select("user_id, status")
            .eq("user_id", actorId)
            .maybeSingle();
          return !error && !!data && data.status === "active";
        });

      const actorValid = await validateOperationsActor(workspaceConfig.operationsActorId);
      if (!actorValid) {
        operationsStatus = "failed";
        errors.push("Configured operations workspace actor does not exist or is not active.");
        isReady = false;
      } else {
        operationsStatus = "ok";
      }
    }
  }

  // 4. Warehouse Workspace readiness
  let warehouseStatus: ReadinessCheckStatus = "disabled";
  if (workspaceConfig.warehouseEnabled) {
    if (!workspaceConfig.warehouseActorId || !workspaceConfig.warehouseId) {
      warehouseStatus = "failed";
      errors.push(
        "PUBLIC_WAREHOUSE_ENABLED is true but WAREHOUSE_WORKSPACE_ACTOR_ID or WAREHOUSE_ID is missing.",
      );
      isReady = false;
    } else {
      const validateWarehouseScope =
        deps.validateWarehouseScope ??
        (async (actorId: string, warehouseId: string) => {
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

          return !memError && !!membership;
        });

      const scopeValid = await validateWarehouseScope(
        workspaceConfig.warehouseActorId,
        workspaceConfig.warehouseId,
      );
      if (!scopeValid) {
        warehouseStatus = "failed";
        errors.push("Configured warehouse actor is not scoped to an approved warehouse.");
        isReady = false;
      } else {
        warehouseStatus = "ok";
      }
    }
  }

  return {
    ready: isReady,
    status: isReady ? "ready" : "not_ready",
    checks: {
      database: dbStatus,
      operationsWorkspace: operationsStatus,
      warehouseWorkspace: warehouseStatus,
    },
    ...(errors.length > 0 ? { errors } : {}),
  };
}
