/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";

export type ClaimResult =
  | { action: "proceed"; recordId: string }
  | { action: "replay"; responseStatus: number; responseBody: unknown }
  | { action: "conflict" }
  | { action: "in_progress" };

export class IdempotencyRepository {
  constructor(private readonly db: SupabaseClient = supabase as unknown as SupabaseClient) {}

  async claim(
    userId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<ClaimResult> {
    const { data, error } = await this.db.rpc("claim_idempotency_record", {
      p_user_id: userId,
      p_operation: operation,
      p_idempotency_key: key,
      p_request_hash: requestHash,
    });
    if (error) throw new Error(error.message);
    return data as ClaimResult;
  }

  async complete(recordId: string, status: number, body: unknown): Promise<void> {
    const { error } = await this.db.rpc("complete_idempotency_record", {
      p_record_id: recordId,
      p_response_status: status,
      p_response_body: body,
    });
    if (error) throw new Error(error.message);
  }

  async fail(recordId: string): Promise<void> {
    const { error } = await this.db.rpc("fail_idempotency_record", { p_record_id: recordId });
    if (error) throw new Error(error.message);
  }
}
