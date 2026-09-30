import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { PaymentsRepository } from "./payments.repository.js";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const auditContext = { requestId: "request-id", ipAddress: "127.0.0.1", userAgent: "test" };
function setup(data: unknown = {}, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    rpc,
    repository: new PaymentsRepository({ rpc } as unknown as SupabaseClient<Database>),
  };
}
describe("payment finance persistence", () => {
  it("applies provider evidence and audit through one transactional RPC", async () => {
    const { rpc, repository } = setup({ outcome: "status_updated" });
    const evidence = {
      status: "successful",
      amount: 1000,
      currency: "UGX",
      transactionId: "provider-reference",
    };
    await repository.applyReconciliation(
      "payment",
      evidence,
      "admin_request",
      "staff",
      "operation",
      auditContext,
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("apply_payment_reconciliation_audited", {
      p_payment_id: "payment",
      p_evidence: evidence,
      p_source: "admin_request",
      p_actor: "staff",
      p_operation_id: "operation",
      p_audit_context: auditContext,
    });
  });
  it("uses the redacted database projection for finance detail", async () => {
    const { rpc, repository } = setup({ id: "payment", reconciliations: [] });
    await expect(repository.getFinanceDetail("payment")).resolves.toMatchObject({ id: "payment" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_get_payment_detail", {
      p_payment_id: "payment",
    });
  });
  it("binds refund input to the authenticated actor at the transaction boundary", async () => {
    const { rpc, repository } = setup({ status: "awaiting_approval" });
    const input = {
      operationId: "operation",
      expectedVersion: 3,
      reasonCode: "other",
      reason: "Review refund",
      amount: 1000,
    };
    await repository.commandFinance("staff", "payment", "request-refund", input, auditContext);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("command_payment_finance_audited", {
      p_actor: "staff",
      p_payment_id: "payment",
      p_action: "request-refund",
      p_input: input,
      p_audit_context: auditContext,
    });
  });
  it.each([
    ["P0002", 404],
    ["42501", 403],
    ["55000", 409],
    ["22023", 422],
  ])("preserves the safe domain error for %s", async (code, statusCode) => {
    const { repository } = setup(null, { code, message: "Finance command rejected." });
    await expect(
      repository.commandFinance(
        "staff",
        "payment",
        "request-refund",
        {
          operationId: "operation",
          expectedVersion: 3,
          reasonCode: "other",
          reason: "Review refund",
          amount: 1000,
        },
        auditContext,
      ),
    ).rejects.toMatchObject({ statusCode });
  });
});
