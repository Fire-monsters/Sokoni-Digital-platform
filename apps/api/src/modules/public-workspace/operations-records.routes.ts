import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { Database, Json } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../infrastructure/supabase/client.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import type { AuditWriteContext } from "../admin/workflows/index.js";

const id = z.uuid();
const params = z.object({ id });
const note = z.string().trim().min(3).max(2000);
const operation = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive().optional(), reason: z.string().trim().min(3) });
const noteInput = operation.extend({ note });
const caseInput = operation.extend({ investigationId: id, expectedVersion: z.number().int().positive() });
const caseNoteInput = caseInput.extend({ note });
const resolveInput = caseInput.extend({ resolution: note });
const paymentInput = operation.extend({ externalReference: z.string().trim().min(3).max(160), amount: z.number().int().positive().optional(), observedAt: z.iso.datetime({ offset: true }), note });
const priceNoteInput = operation.extend({ note: z.string().trim().min(3).max(1000) });
interface CaseRow { id: string; checkout_id: string; status: string; opened_by: string; opened_at: string; resolution: string | null; resolved_by: string | null; resolved_at: string | null; version: number }
interface NoteRow { id: string; note: string; actor_id: string; created_at: string }
interface PaymentRow { id: string; payment_attempt_id: string; external_reference: string; observed_amount_ugx: number | null; observed_at: string; note: string; recorded_by: string; recorded_at: string }
type CatalogueNoteRow = NoteRow & { listing_id: string | null; price_request_id: string | null };
type OperationsDatabase = Database & { public: { Tables: {
  operations_order_investigations: { Row: CaseRow; Insert: CaseRow; Update: Partial<CaseRow>; Relationships: [] };
  operations_payment_records: { Row: PaymentRow; Insert: PaymentRow; Update: Partial<PaymentRow>; Relationships: [] };
  operations_delivery_notes: { Row: NoteRow & { delivery_id: string }; Insert: NoteRow & { delivery_id: string }; Update: Partial<NoteRow>; Relationships: [] };
  operations_catalogue_notes: { Row: CatalogueNoteRow; Insert: CatalogueNoteRow; Update: Partial<CatalogueNoteRow>; Relationships: [] };
}}};
const db = supabase as unknown as SupabaseClient<OperationsDatabase>;
function resultOrThrow<T>(result: { data: T; error: { code?: string; message: string } | null }): T {
  if (result.error) {
    const code = result.error.code;
    const statusCode = code === "P0002" ? 404 : code === "42501" ? 403 : code === "22023" || code === "23502" ? 400 : code === "23505" || code === "23514" || code === "40001" ? 409 : 500;
    throw Object.assign(new Error(statusCode === 500 ? "Operations record request failed." : result.error.message), { statusCode, code: statusCode === 404 ? "NOT_FOUND" : statusCode === 403 ? "FORBIDDEN" : statusCode === 409 ? "CONFLICT" : statusCode === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR" });
  }
  return result.data;
}
const context = (audit: AuditWriteContext) => audit as unknown as Json;
export function createOperationsRecordsRouter(boundary: RequestHandler): Router {
  const router = Router();
  router.use(boundary);
  const read = (path: string, permission: "orders.read" | "payments.read" | "deliveries.read" | "catalogue.read", schema: typeof params, query: (id: string) => Promise<unknown>) =>
    router.get(path, requirePermission(permission), async (request, response, next) => {
      const parsed = schema.safeParse(request.params);
      if (!parsed.success) { sendZodValidationError(request, response, parsed.error.issues); return; }
      try { sendSuccess(request, response, 200, await query(parsed.data.id)); } catch (error) { next(error); }
    });
  read("/orders/:id/investigations", "orders.read", params, async orderId => {
    const cases = resultOrThrow(await db.from("operations_order_investigations").select("*").eq("checkout_id",orderId).order("opened_at",{ascending:false}));
    const notes = resultOrThrow(await db.from("order_support_notes").select("id,note,author_id,created_at,investigation_id").eq("checkout_id",orderId).not("investigation_id","is",null).order("created_at"));
    return { cases, notes };
  });
  read("/payments/:id/records", "payments.read", params, async paymentId => resultOrThrow(await db.from("operations_payment_records").select("*").eq("payment_attempt_id",paymentId).order("recorded_at",{ascending:false})));
  read("/deliveries/:id/notes", "deliveries.read", params, async deliveryId => resultOrThrow(await db.from("operations_delivery_notes").select("*").eq("delivery_id",deliveryId).order("created_at",{ascending:false})));
  read("/listings/:id/notes", "catalogue.read", params, async listingId => resultOrThrow(await db.from("operations_catalogue_notes").select("*").eq("listing_id",listingId).order("created_at",{ascending:false})));
  read("/price-requests/:id/notes", "catalogue.read", params, async requestId => resultOrThrow(await db.from("operations_catalogue_notes").select("*").eq("price_request_id",requestId).order("created_at",{ascending:false})));
  const command = <T extends z.ZodType>(path: string, action: string, permission: "orders.support" | "payments.reconcile" | "deliveries.manage" | "catalogue.review", bodySchema: T, execute: (id: string, actor: string, input: z.output<T>, audit: AuditWriteContext) => Promise<unknown>) => {
    router.post(path, ...createAdminWorkflowRoute({ operation: action, permission, paramsSchema: params, bodySchema, execute: ({params, actor, input, auditContext}) => execute(params.id,actor.userId,input,auditContext) }));
  };
  const procedureClient = supabase as unknown as { rpc: (name: string, args: Record<string, Json | undefined>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }> };
  const rpc = async (name: "operations_investigation_command" | "operations_payment_record_command" | "operations_delivery_note_command" | "operations_catalogue_note_command", args: Record<string, Json | undefined>) => resultOrThrow(await procedureClient.rpc(name,args));
  command("/orders/:id/investigations", "operations.investigation.open", "orders.support", operation, (id,actor,input,audit) => rpc("operations_investigation_command",{p_order_id:id,p_actor:actor,p_action:"open",p_input:input,p_context:context(audit)}));
  command("/orders/:id/investigations/notes", "operations.investigation.note", "orders.support", caseNoteInput, (id,actor,input,audit) => rpc("operations_investigation_command",{p_order_id:id,p_actor:actor,p_action:"notes",p_input:input,p_context:context(audit)}));
  command("/orders/:id/investigations/resolve", "operations.investigation.resolve", "orders.support", resolveInput, (id,actor,input,audit) => rpc("operations_investigation_command",{p_order_id:id,p_actor:actor,p_action:"resolve",p_input:input,p_context:context(audit)}));
  command("/payments/:id/records", "operations.payment.record", "payments.reconcile", paymentInput, (id,actor,input,audit) => rpc("operations_payment_record_command",{p_payment_id:id,p_actor:actor,p_input:input,p_context:context(audit)}));
  command("/deliveries/:id/notes", "operations.delivery.note", "deliveries.manage", noteInput.extend({expectedVersion:z.number().int().positive()}), (id,actor,input,audit) => rpc("operations_delivery_note_command",{p_delivery_id:id,p_actor:actor,p_input:input,p_context:context(audit)}));
  command("/listings/:id/notes", "operations.catalogue.note", "catalogue.review", priceNoteInput.extend({expectedVersion:z.number().int().positive()}), (id,actor,input,audit) => rpc("operations_catalogue_note_command",{p_entity_id:id,p_actor:actor,p_kind:"listing",p_input:input,p_context:context(audit)}));
  command("/price-requests/:id/notes", "operations.price.note", "catalogue.review", priceNoteInput, (id,actor,input,audit) => rpc("operations_catalogue_note_command",{p_entity_id:id,p_actor:actor,p_kind:"price_request",p_input:input,p_context:context(audit)}));
  return router;
}
