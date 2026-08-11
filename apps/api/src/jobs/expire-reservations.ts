/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../infrastructure/supabase/client.js";

export interface ReservationExpiryResult {
  expiredReservations: number;
  durationMs: number;
}

export async function expireReservations(
  batchSize = 100,
  db: SupabaseClient = supabase as unknown as SupabaseClient,
): Promise<ReservationExpiryResult> {
  const startedAt = performance.now();
  const { data, error } = await db.rpc("expire_inventory_reservations", {
    p_batch_size: batchSize,
  });
  if (error) {
    console.error(
      JSON.stringify({ event: "inventory_reservations.expiry_failed", error: error.message }),
    );
    throw new Error(error.message);
  }
  const result = { expiredReservations: Number(data), durationMs: performance.now() - startedAt };
  console.info(JSON.stringify({ event: "inventory_reservations.expired", ...result }));
  return result;
}
