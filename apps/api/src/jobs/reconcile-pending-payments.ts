import type { PaymentsService } from "../modules/payments/payments.service.js";
import { createPaymentsService } from "../modules/payments/payments.composition.js";

let running = false;

export async function reconcilePendingPayments(
  service: PaymentsService = createPaymentsService(),
): Promise<void> {
  if (running) return;
  running = true;
  const startedAt = performance.now();
  try {
    const result = await service.reconcilePendingBatch();
    console.info(
      JSON.stringify({
        event: "payments.reconciled",
        ...result,
        durationMs: performance.now() - startedAt,
      }),
    );
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "payments.reconciliation_failed",
        error: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  } finally {
    running = false;
  }
}

export function startPaymentReconciliationScheduler(): () => void {
  const timer = setInterval(() => void reconcilePendingPayments(), 60_000);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
