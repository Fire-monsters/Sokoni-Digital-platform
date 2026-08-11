import cors from "cors";
import express from "express";
import type { Request } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler } from "./middleware/error-handler.js";
import { capturePaymentCallbackRawBody } from "./middleware/capture-raw-body.js";
import { notFound } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { adminRouter } from "./modules/admin/index.js";
import { authRouter } from "./modules/auth/index.js";
import { createCatalogueRouter } from "./modules/catalogue/index.js";
import { createCartRouter } from "./modules/carts/index.js";
import { createCheckoutRouter, createConsumerOrdersRouter } from "./modules/checkout/index.js";
import {
  createPaymentAdminRouter,
  createPaymentOperationsRouter,
  createPaymentsRouter,
} from "./modules/payments/index.js";
import { meRouter } from "./modules/me/index.js";
import { createListingsRouter } from "./modules/listings/index.js";
import { createListingApprovalRouter } from "./modules/listing-approval/index.js";
import { createVendorOrdersRouter } from "./modules/orders/index.js";
import { createQualityChecksRouter } from "./modules/quality/index.js";
import { createNotificationsRouter } from "./modules/notifications/index.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestContext);
  app.use(
    pinoHttp({
      customProps: (request: Request) => ({
        requestId: request.requestId,
      }),
    }),
  );
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "250kb", verify: capturePaymentCallbackRawBody }));

  app.get("/health", (request, response) => {
    response.status(200).json({
      success: true,
      data: {
        service: "ekatale-api",
        status: "healthy",
      },
      meta: {
        requestId: request.requestId,
      },
    });
  });

  app.use("/v1/auth", authRouter);
  app.use("/v1/catalogue", createCatalogueRouter());
  app.use("/v1/carts", createCartRouter());
  app.use("/v1/checkouts", createCheckoutRouter());
  app.use("/v1/orders", createConsumerOrdersRouter());
  app.use("/v1/notifications", createNotificationsRouter());
  app.use("/v1", createPaymentsRouter());
  app.use("/v1/operations", createPaymentOperationsRouter());
  app.use("/v1/me", meRouter);
  app.use("/v1/vendor/listings", createListingsRouter());
  app.use("/v1/vendor/orders", createVendorOrdersRouter());
  app.use("/v1/vendor/orders", createQualityChecksRouter());
  app.use("/v1/admin", createListingApprovalRouter());
  app.use("/v1/admin", createPaymentAdminRouter());
  app.use("/v1/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
