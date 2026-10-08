/* eslint-disable @typescript-eslint/array-type */
import "dotenv/config";

import { parseServerEnvironment } from "./config/index.js";

import { createApp } from "./app.js";
import { startPaymentReconciliationScheduler } from "./jobs/reconcile-pending-payments.js";
import { startNotificationScheduler } from "./jobs/retry-notifications.js";
import { startRiderOfferExpiryScheduler } from "./jobs/expire-rider-offers.js";
import { closeAdminOperationCoordinator } from "./modules/admin/workflows/admin-operation.redis.js";

const env = parseServerEnvironment();
const port = env.PORT;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`E-Katale API listening on http://localhost:${String(port)}`);
});
const stopSchedulers: Array<() => void> = [];
if (env.APP_MODE === "full") {
  stopSchedulers.push(
    startPaymentReconciliationScheduler(),
    startNotificationScheduler(),
    startRiderOfferExpiryScheduler(),
  );
}

function shutdown(signal: string): void {
  console.log(`${signal} received. Closing HTTP server.`);

  for (const stop of stopSchedulers) stop();
  server.close((error) => {
    if (error) {
      console.error("HTTP server shutdown failed", error);
      process.exit(1);
    }

    void closeAdminOperationCoordinator()
      .then(() => process.exit(0))
      .catch((closeError: unknown) => {
        console.error("Redis shutdown failed", closeError);
        process.exit(1);
      });
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
