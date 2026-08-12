import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { DispatcherService } from "./dispatcher.service.js";

vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("DispatcherService", () => {
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
    const service = new DispatcherService({ rpc } as unknown as SupabaseClient<Database>);
    const result = await service.performAction("dispatcher", "delivery", {
      action: "CONTACT_RIDER",
      reason: "Customer requested an ETA",
      expectedVersion: 6,
      operationId: "operation",
    });

    expect(result.contactPhoneNumber).toBe("+256700000000");
    expect(rpc).toHaveBeenCalledWith("dispatcher_delivery_action", {
      p_delivery_id: "delivery",
      p_dispatcher_user_id: "dispatcher",
      p_action: "CONTACT_RIDER",
      p_reason: "Customer requested an ETA",
      p_expected_version: 6,
      p_operation_id: "operation",
    });
  });
});
