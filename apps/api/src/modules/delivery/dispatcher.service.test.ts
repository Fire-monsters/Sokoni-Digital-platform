import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseDeliveryOperationsRepository } from "./delivery-operations.repository.js";

vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const auditContext = { requestId: "request-id", ipAddress: "127.0.0.1", userAgent: "test" };

describe("SupabaseDeliveryOperationsRepository", () => {
  it("loads one delivery control-room projection", async () => {
    const detail = { delivery: { id: "delivery" }, assignmentHistory: [], timeline: [] };
    const rpc = vi.fn().mockResolvedValue({ data: detail, error: null });
    const repository = new SupabaseDeliveryOperationsRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.getDelivery("delivery")).resolves.toBe(detail);
    expect(rpc).toHaveBeenCalledWith("get_dispatcher_delivery_detail", {
      p_delivery_id: "delivery",
    });
  });

  it("forwards audited override identity and maps contact access", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deliveryId: "delivery",
        action: "CONTACT_RIDER",
        status: "in_transit",
        version: 6,
        operationId: "operation",
        contactPhoneNumber: "+256700000000",
        duplicate: false,
      },
      error: null,
    });
    const repository = new SupabaseDeliveryOperationsRepository({
      rpc,
    } as unknown as SupabaseClient<Database>);
    const result = await repository.performAction(
      "dispatcher",
      "delivery",
      {
        action: "CONTACT_RIDER",
        reason: "Customer requested an ETA",
        expectedVersion: 6,
        operationId: "operation",
      },
      auditContext,
    );

    expect(result.contactPhoneNumber).toBe("+256700000000");
    expect(rpc).toHaveBeenCalledWith("dispatcher_delivery_action_audited", {
      p_delivery_id: "delivery",
      p_dispatcher_user_id: "dispatcher",
      p_action: "CONTACT_RIDER",
      p_reason: "Customer requested an ETA",
      p_expected_version: 6,
      p_operation_id: "operation",
      p_audit_context: auditContext,
    });
  });
});
