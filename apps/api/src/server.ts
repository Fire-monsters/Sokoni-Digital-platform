import "dotenv/config";

import { createApp } from "./app.js";
import { startPaymentReconciliationScheduler } from "./jobs/reconcile-pending-payments.js";
import { startNotificationScheduler } from "./jobs/retry-notifications.js";
import { startRiderOfferExpiryScheduler } from "./jobs/expire-rider-offers.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`E-Katale API listening on http://localhost:${String(port)}`);
});
const stopPaymentReconciliation = startPaymentReconciliationScheduler();
const stopNotifications = startNotificationScheduler();
const stopRiderOfferExpiry = startRiderOfferExpiryScheduler();

function shutdown(signal: string): void {
  console.log(`${signal} received. Closing HTTP server.`);

  stopPaymentReconciliation();
  stopNotifications();
  stopRiderOfferExpiry();
  server.close((error) => {
    if (error) {
      console.error("HTTP server shutdown failed", error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
