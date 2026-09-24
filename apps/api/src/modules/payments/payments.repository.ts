import type {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentFinanceDetail,
  PaymentFinanceInput,
  PaymentFinanceResult,
  PaymentRecheckResult,
} from "@sokoni-digital/domain";
import type { Database, Json } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import {
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentOperationForbiddenError,
  PaymentRejectedError,
} from "./payments.errors.js";
import type { AuditWriteContext } from "../admin/workflows/index.js";

export interface PaymentAttemptRecord {
  id: string;
  checkoutId: string;
  consumerId: string;
  provider: PaymentProvider;
  paymentMethod: PaymentMethod | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  payerPhoneE164: string | null;
  merchantReference: string;
  providerTransactionId: string | null;
  redirectUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class PaymentsRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async getFinanceDetail(id: string): Promise<PaymentFinanceDetail> {
    const { data, error } = await this.db.rpc("admin_get_payment_detail", { p_payment_id: id });
    if (error) throw mapDatabaseError(error);
    return data as unknown as PaymentFinanceDetail;
  }

  async commandFinance(
    actor: string,
    id: string,
    action: string,
    input: PaymentFinanceInput,
    auditContext: AuditWriteContext,
  ): Promise<PaymentFinanceResult> {
    const { data, error } = await this.db.rpc("command_payment_finance_audited", {
      p_actor: actor,
      p_payment_id: id,
      p_action: action,
      p_input: toJson(input),
      p_audit_context: auditContext as unknown as Json,
    });
    if (error) throw mapDatabaseError(error);
    return data as unknown as PaymentFinanceResult;
  }

  async applyReconciliation(
    id: string,
    evidence: Record<string, unknown>,
    source: string,
    actor?: string,
    operationId?: string,
    auditContext?: AuditWriteContext,
  ): Promise<PaymentRecheckResult> {
    const request = {
      p_payment_id: id,
      p_evidence: toJson(evidence),
      p_source: source,
      ...(actor === undefined ? {} : { p_actor: actor }),
      ...(operationId === undefined ? {} : { p_operation_id: operationId }),
    };
    const { data, error } =
      auditContext && actor && operationId
        ? await this.db.rpc("apply_payment_reconciliation_audited", {
            p_payment_id: id,
            p_evidence: toJson(evidence),
            p_source: source,
            p_actor: actor,
            p_operation_id: operationId,
            p_audit_context: auditContext as unknown as Json,
          })
        : await this.db.rpc("apply_payment_reconciliation", request);
    if (error) throw mapDatabaseError(error);
    return data as unknown as PaymentRecheckResult;
  }

  async claimAdminBatch(
    actor: string,
    operationId: string,
    limit: number,
  ): Promise<PaymentAttemptRecord[]> {
    const { data, error } = await this.db.rpc("claim_admin_payment_batch", {
      p_actor: actor,
      p_operation_id: operationId,
      p_limit: limit,
    });
    if (error) throw mapDatabaseError(error);
    return data.map(mapAttempt);
  }

  async createAttempt(
    consumerId: string,
    checkoutId: string,
    payerPhoneE164: string | undefined,
    maxAttempts: number,
    pendingMinutes: number,
  ): Promise<PaymentAttemptRecord> {
    const { data, error } = await this.db.rpc("create_pesapal_payment_attempt", {
      p_consumer_id: consumerId,
      p_checkout_id: checkoutId,
      ...(payerPhoneE164 === undefined ? {} : { p_payer_phone_e164: payerPhoneE164 }),
      p_max_attempts: maxAttempts,
      p_pending_minutes: pendingMinutes,
    });
    if (error) throw mapDatabaseError(error);
    const value = asRecord(data);
    return {
      id: requiredString(value.id, "id"),
      checkoutId: requiredString(value.checkoutId, "checkoutId"),
      consumerId,
      provider: "pesapal",
      paymentMethod: null,
      status: requiredString(value.status, "status") as PaymentStatus,
      amount: requiredNumber(value.amount, "amount"),
      currency: requiredString(value.currency, "currency"),
      payerPhoneE164: nullableString(value.payerPhoneE164, "payerPhoneE164"),
      merchantReference: requiredString(value.merchantReference, "merchantReference"),
      providerTransactionId: null,
      redirectUrl: null,
      failureCode: null,
      failureMessage: null,
      expiresAt: nullableString(value.expiresAt, "expiresAt"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async createMarketPickupAttempt(
    consumerId: string,
    checkoutId: string,
  ): Promise<PaymentAttemptRecord> {
    const { data, error } = await this.db.rpc("create_market_pickup_payment_attempt", {
      p_consumer_id: consumerId,
      p_checkout_id: checkoutId,
    });
    if (error) throw mapDatabaseError(error);
    const value = asRecord(data);
    return {
      id: requiredString(value.id, "id"),
      checkoutId: requiredString(value.checkoutId, "checkoutId"),
      consumerId: requiredString(value.consumerId, "consumerId"),
      provider: "market_pickup",
      paymentMethod: "market_pickup",
      status: "pending",
      amount: requiredNumber(value.amount, "amount"),
      currency: requiredString(value.currency, "currency"),
      payerPhoneE164: null,
      merchantReference: requiredString(value.merchantReference, "merchantReference"),
      providerTransactionId: null,
      redirectUrl: null,
      failureCode: null,
      failureMessage: null,
      expiresAt: null,
      createdAt: requiredString(value.createdAt, "createdAt"),
      updatedAt: requiredString(value.updatedAt, "updatedAt"),
    };
  }

  async recordMarketPickupPayment(input: {
    actorId: string;
    actorIsOperations: boolean;
    checkoutId: string;
    amountReceived: number;
    currency: "UGX";
    paymentMethod: "cash" | "mobile_money" | "card" | "other";
    pickupCode: string;
    operationId: string;
  }) {
    const { data, error } = await this.db.rpc("record_market_pickup_payment", {
      p_actor_id: input.actorId,
      p_actor_is_operations: input.actorIsOperations,
      p_checkout_id: input.checkoutId,
      p_amount_received_ugx: input.amountReceived,
      p_currency: input.currency,
      p_collection_method: input.paymentMethod,
      p_pickup_code: input.pickupCode,
      p_operation_id: input.operationId,
    });
    if (error) throw mapDatabaseError(error);
    return data;
  }

  async markPending(
    id: string,
    transactionId: string,
    requestReference: string | undefined,
    redirectUrl: string,
  ) {
    const { error } = await this.db.rpc("mark_payment_attempt_pending", {
      p_payment_attempt_id: id,
      p_provider_transaction_id: transactionId,
      p_provider_request_reference: requestReference ?? transactionId,
      p_provider_redirect_url: redirectUrl,
    });
    if (error) throw mapDatabaseError(error);
  }

  async markUncertain(id: string, code: string, message: string) {
    const { error } = await this.db.rpc("mark_payment_attempt_uncertain", {
      p_payment_attempt_id: id,
      p_failure_code: code,
      p_failure_message: message,
    });
    if (error) throw mapDatabaseError(error);
  }

  async markInitiationFailed(id: string, code: string, message: string) {
    const { error } = await this.db.rpc("mark_payment_initiation_failed", {
      p_payment_attempt_id: id,
      p_failure_code: code,
      p_failure_message: message,
    });
    if (error) throw mapDatabaseError(error);
  }

  async getOwned(consumerId: string, id: string): Promise<PaymentAttemptRecord> {
    const { data, error } = await this.db
      .from("payment_attempts")
      .select("*")
      .eq("id", id)
      .eq("consumer_id", consumerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new PaymentNotFoundError("Payment attempt was not found.");
    return mapAttempt(data);
  }

  async getByMerchantReference(reference: string): Promise<PaymentAttemptRecord> {
    const { data, error } = await this.db
      .from("payment_attempts")
      .select("*")
      .eq("merchant_reference", reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new PaymentNotFoundError("Payment attempt was not found.");
    return mapAttempt(data);
  }

  async getById(id: string): Promise<PaymentAttemptRecord> {
    const { data, error } = await this.db
      .from("payment_attempts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new PaymentNotFoundError("Payment attempt was not found.");
    return mapAttempt(data);
  }

  async getReconciliationOverview(limit: number) {
    const [attempts, runs] = await Promise.all([
      this.db
        .from("payment_attempts")
        .select(
          "id, checkout_id, merchant_reference, provider, status, amount_ugx, currency_code, provider_transaction_id, next_reconciliation_at, reconciliation_claimed_until, failure_code, failure_message, updated_at",
        )
        .in("status", ["pending", "requires_reconciliation"])
        .order("next_reconciliation_at", { ascending: true, nullsFirst: true })
        .limit(limit),
      this.db
        .from("payment_reconciliation_runs")
        .select(
          "id, payment_attempt_id, provider, previous_status, provider_status, result, run_source, requested_by, provider_amount_ugx, provider_currency, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);
    if (attempts.error) throw new Error(attempts.error.message);
    if (runs.error) throw new Error(runs.error.message);
    return { attempts: attempts.data, recentRuns: runs.data };
  }

  async recordProviderEvent(input: {
    provider: PaymentProvider;
    providerEventId?: string;
    providerTransactionId: string;
    merchantReference: string;
    payload: unknown;
    payloadHash: string;
    requestId?: string;
    headersRedacted: Record<string, string>;
  }): Promise<{ id: string; duplicate: boolean }> {
    const { data, error } = await this.db
      .from("payment_provider_events")
      .insert({
        provider: input.provider,
        provider_event_id: input.providerEventId ?? null,
        provider_transaction_id: input.providerTransactionId,
        merchant_reference: input.merchantReference,
        payload: toJson(input.payload),
        payload_hash: input.payloadHash,
        request_id: input.requestId ?? null,
        headers_redacted: input.headersRedacted,
      })
      .select("id")
      .single();
    if (!error) return { id: data.id, duplicate: false };
    if (error.code !== "23505") throw new Error(error.message);
    if (input.providerEventId !== undefined) {
      const existingByEvent = await this.db
        .from("payment_provider_events")
        .select("id")
        .eq("provider", input.provider)
        .eq("provider_event_id", input.providerEventId)
        .maybeSingle();
      if (existingByEvent.error) throw new Error(existingByEvent.error.message);
      if (existingByEvent.data) return { id: existingByEvent.data.id, duplicate: true };
    }
    const existing = await this.db
      .from("payment_provider_events")
      .select("id")
      .eq("provider", input.provider)
      .eq("payload_hash", input.payloadHash)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    return { id: existing.data.id, duplicate: true };
  }

  async finishProviderEvent(
    id: string,
    status: "processed" | "duplicate" | "rejected" | "failed",
    reason?: string,
    authenticityVerified = false,
  ) {
    const { error } = await this.db
      .from("payment_provider_events")
      .update({
        processing_status: status,
        processed_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? (reason ?? "rejected") : null,
        authenticity_verified_at: authenticityVerified ? new Date().toISOString() : null,
        verification_method: authenticityVerified ? "provider_status_lookup" : null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async claimReconciliationBatch(batchSize: number): Promise<PaymentAttemptRecord[]> {
    const { data, error } = await this.db.rpc("claim_payment_reconciliation_batch", {
      p_batch_size: batchSize,
      p_claim_seconds: 55,
    });
    if (error) throw new Error(error.message);
    const rows: unknown = data;
    if (!Array.isArray(rows)) throw new Error("Database returned an invalid reconciliation batch.");
    return rows.map(mapAttempt);
  }

  async releaseReconciliationClaim(paymentAttemptId: string, nextSeconds: number) {
    const { error } = await this.db.rpc("release_payment_reconciliation_claim", {
      p_payment_attempt_id: paymentAttemptId,
      p_next_seconds: nextSeconds,
    });
    if (error) throw new Error(error.message);
  }
}

function mapAttempt(input: unknown): PaymentAttemptRecord {
  const value = asRecord(input);
  return {
    id: requiredString(value.id, "id"),
    checkoutId: requiredString(value.checkout_id, "checkout_id"),
    consumerId: requiredString(value.consumer_id, "consumer_id"),
    provider: requiredString(value.provider, "provider") as PaymentProvider,
    paymentMethod: nullableString(value.payment_method, "payment_method") as PaymentMethod | null,
    status: requiredString(value.status, "status") as PaymentStatus,
    amount: requiredNumber(value.amount_ugx, "amount_ugx"),
    currency: requiredString(value.currency_code, "currency_code"),
    payerPhoneE164: nullableString(value.payer_phone_e164, "payer_phone_e164"),
    merchantReference: requiredString(value.merchant_reference, "merchant_reference"),
    providerTransactionId: nullableString(value.provider_transaction_id, "provider_transaction_id"),
    redirectUrl: nullableString(value.provider_redirect_url, "provider_redirect_url"),
    failureCode: nullableString(value.failure_code, "failure_code"),
    failureMessage: nullableString(value.failure_message, "failure_message"),
    expiresAt: nullableString(value.expires_at, "expires_at"),
    createdAt: requiredString(value.created_at, "created_at"),
    updatedAt: requiredString(value.updated_at, "updated_at"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Database returned an invalid payment record.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database returned an invalid ${field}.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Database returned an invalid ${field}.`);
  }
  return value;
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite values cannot be stored as JSON.");
    return value;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, toJson(entry)]],
      ),
    );
  }
  throw new Error("Value cannot be stored as JSON.");
}

function mapDatabaseError(error: { code?: string; message: string }): Error {
  if (error.code === "P0002") return new PaymentNotFoundError(error.message);
  if (error.code === "42501") return new PaymentOperationForbiddenError(error.message);
  if (["23505", "55000"].includes(error.code ?? "")) return new PaymentConflictError(error.message);
  if (["23514", "22023", "54000"].includes(error.code ?? ""))
    return new PaymentRejectedError(error.message);
  return new Error(error.message);
}
