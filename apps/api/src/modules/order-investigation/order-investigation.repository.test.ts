import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseOrderInvestigationRepository } from "./order-investigation.repository.js";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const auditContext = { requestId: "request-id", ipAddress: "127.0.0.1", userAgent: "test" };

describe("order investigation persistence", () => {
  it("uses one transactional RPC with server-bound actor identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "recorded" }, error: null });
    const repository = new SupabaseOrderInvestigationRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);
    await repository.command(
      "order",
      "actor",
      "notes",
      {
        operationId: "operation",
        note: "Private note",
      },
      auditContext,
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("command_order_investigation_audited", {
      p_order_id: "order",
      p_actor: "actor",
      p_action: "notes",
      p_input: { operationId: "operation", note: "Private note" },
      p_audit_context: auditContext,
    });
  });
  it.each([
    ["P0002", 404],
    ["42501", 403],
    ["22023", 400],
    ["40001", 409],
    ["55P03", 409],
    ["55000", 409],
  ])("maps database code %s to a safe domain response", async (code, statusCode) => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code, message: "Rejected safely." } });
    const repository = new SupabaseOrderInvestigationRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);
    await expect(
      repository.command(
        "order",
        "actor",
        "cancel",
        {
          operationId: "operation",
          reason: "Cancel",
        },
        auditContext,
      ),
    ).rejects.toMatchObject({ statusCode });
  });
  it("masks unexpected database messages", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "private database detail" },
    });
    const repository = new SupabaseOrderInvestigationRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);
    await expect(
      repository.command("order", "actor", "cancel", {}, auditContext),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Order investigation operation failed.",
    });
  });
});
