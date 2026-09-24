import type { Database, Json } from "@sokoni-digital/database-types";
import type {
  OrderInvestigationAction,
  OrderInvestigationCommandResult,
} from "@sokoni-digital/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../infrastructure/supabase/client.js";
import type { AuditWriteContext } from "../admin/workflows/index.js";

export interface OrderInvestigationWriter {
  command(
    orderId: string,
    actorId: string,
    action: OrderInvestigationAction,
    input: Record<string, unknown>,
    auditContext: AuditWriteContext,
  ): Promise<OrderInvestigationCommandResult>;
}

export class SupabaseOrderInvestigationRepository implements OrderInvestigationWriter {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}
  async command(
    orderId: string,
    actorId: string,
    action: OrderInvestigationAction,
    input: Record<string, unknown>,
    auditContext: AuditWriteContext,
  ) {
    const { data, error } = await this.db.rpc("command_order_investigation_audited", {
      p_order_id: orderId,
      p_actor: actorId,
      p_action: action,
      p_input: input as Json,
      p_audit_context: auditContext as unknown as Json,
    });
    if (error) throw orderInvestigationError(error);
    return data as unknown as OrderInvestigationCommandResult;
  }
}

export function orderInvestigationError(error: { code?: string; message: string }): Error {
  const statusCode =
    error.code === "P0002"
      ? 404
      : error.code === "42501"
        ? 403
        : error.code === "22023"
          ? 400
          : ["23514", "23505", "40001", "55P03", "55000"].includes(error.code ?? "")
            ? 409
            : 500;
  return Object.assign(
    new Error(statusCode === 500 ? "Order investigation operation failed." : error.message),
    {
      statusCode,
      code:
        statusCode === 404
          ? "NOT_FOUND"
          : statusCode === 403
            ? "FORBIDDEN"
            : statusCode === 400
              ? "BAD_REQUEST"
              : statusCode === 409
                ? "CONFLICT"
                : "INTERNAL_ERROR",
    },
  );
}
