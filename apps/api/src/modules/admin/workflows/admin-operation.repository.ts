import type { Database, Json } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../../infrastructure/supabase/client.js";

export interface AdminOperationClaimInput {
  operationId: string;
  actorStaffId: string;
  operationType: string;
  entityType: string;
  entityId: string | null;
  requestHash: string;
  reason: string;
  expectedVersion: number;
}

export type AdminOperationClaim =
  | { action: "proceed"; operationId: string }
  | { action: "conflict" }
  | { action: "in_progress" }
  | { action: "replay"; outcome: "success"; responseStatus: number; responseBody: unknown }
  | {
      action: "replay";
      outcome: "error";
      responseStatus: number;
      errorCode: string;
      errorMessage: string;
      currentVersion?: number;
    };

export interface AdminOperationFailure {
  responseStatus: number;
  errorCode: string;
  errorMessage: string;
  currentVersion?: number;
}

export interface AdminOperationRepository {
  claim(input: AdminOperationClaimInput): Promise<AdminOperationClaim>;
  complete(operationId: string, responseStatus: number, responseBody: unknown): Promise<void>;
  fail(operationId: string, failure: AdminOperationFailure): Promise<void>;
}

export class SupabaseAdminOperationRepository implements AdminOperationRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async claim(input: AdminOperationClaimInput): Promise<AdminOperationClaim> {
    const { data, error } = await this.db.rpc("claim_admin_operation", {
      p_operation_id: input.operationId,
      p_actor_staff_id: input.actorStaffId,
      p_operation_type: input.operationType,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_request_hash: input.requestHash,
      p_reason: input.reason,
      p_expected_version: input.expectedVersion,
    });
    if (error) throw new Error(`Could not claim admin operation: ${error.message}`);
    return data as AdminOperationClaim;
  }

  async complete(
    operationId: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    const { error } = await this.db.rpc("complete_admin_operation", {
      p_operation_id: operationId,
      p_response_status: responseStatus,
      p_response_body: responseBody as Json,
    });
    if (error) throw new Error(`Could not persist admin operation result: ${error.message}`);
  }

  async fail(operationId: string, failure: AdminOperationFailure): Promise<void> {
    const { error } = await this.db.rpc("fail_admin_operation", {
      p_operation_id: operationId,
      p_response_status: failure.responseStatus,
      p_error_code: failure.errorCode,
      p_error_message: failure.errorMessage,
      ...(failure.currentVersion === undefined
        ? {}
        : { p_current_version: failure.currentVersion }),
    });
    if (error) throw new Error(`Could not persist admin operation failure: ${error.message}`);
  }
}
