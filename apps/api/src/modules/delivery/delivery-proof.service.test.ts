import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { DeliveryProofService } from "./delivery-proof.service.js";

vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("DeliveryProofService", () => {
  it("preserves a committed invalid PIN result and remaining attempts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deliveryId: "delivery",
        confirmed: false,
        confirmedAt: null,
        remainingAttempts: 3,
        locked: false,
        operationId: "operation",
        duplicate: false,
      },
      error: null,
    });
    const service = new DeliveryProofService(clientWithRpc(rpc));

    await expect(
      service.confirmPin("rider", "delivery", "123456", "operation"),
    ).resolves.toMatchObject({ confirmed: false, remainingAttempts: 3, locked: false });
    expect(rpc).toHaveBeenCalledWith("confirm_delivery_consumer_pin", {
      p_delivery_id: "delivery",
      p_rider_user_id: "rider",
      p_pin: "123456",
      p_operation_id: "operation",
    });
  });

  it("completes only through the evidence-aware RPC with version and operation identity", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        deliveryId: "delivery",
        status: "delivered",
        version: 8,
        operationId: "operation",
        duplicate: true,
      },
      error: null,
    });
    const service = new DeliveryProofService(clientWithRpc(rpc));

    await expect(service.completeDelivery("rider", "delivery", 7, "operation")).resolves.toEqual({
      deliveryId: "delivery",
      status: "delivered",
      version: 8,
      operationId: "operation",
      duplicate: true,
    });
    expect(rpc).toHaveBeenCalledWith("complete_delivery", {
      p_delivery_id: "delivery",
      p_rider_user_id: "rider",
      p_expected_version: 7,
      p_operation_id: "operation",
    });
  });
});
