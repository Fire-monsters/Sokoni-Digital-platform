import { parseServerEnvironment } from "../config/index.js";
import type { RiderOperationsRepository } from "../modules/delivery/delivery.types.js";

let running = false;

export async function expireRiderOffers(
  repository?: Pick<RiderOperationsRepository, "expireOffers">,
  batchSize = parseServerEnvironment().RIDER_OFFER_EXPIRY_BATCH_SIZE,
): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const activeRepository =
      repository ??
      new (
        await import("../modules/delivery/delivery.repository.js")
      ).SupabaseRiderOperationsRepository();
    const expired = await activeRepository.expireOffers(batchSize);
    if (expired > 0) {
      console.info(JSON.stringify({ event: "delivery_offers.expired", count: expired }));
    }
    return expired;
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "delivery_offers.expiry_failed",
        error: cause instanceof Error ? cause.message : "unknown",
      }),
    );
    return 0;
  } finally {
    running = false;
  }
}

export function startRiderOfferExpiryScheduler(): () => void {
  const env = parseServerEnvironment();
  const timer = setInterval(
    () => void expireRiderOffers(),
    env.RIDER_OFFER_EXPIRY_POLL_INTERVAL_MS,
  );
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
