import cors from "cors";
import express from "express";
import type { Request } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { adminRouter } from "./modules/admin/index.js";
import { authRouter } from "./modules/auth/index.js";
import { meRouter } from "./modules/me/index.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestContext);
  app.use(
    pinoHttp({
      customProps: (request: Request) => ({
        requestId: request.requestId
      })
    })
  );
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "250kb" }));

  app.get("/health", (request, response) => {
    response.status(200).json({
      success: true,
      data: {
        service: "ekatale-api",
        status: "healthy"
      },
      meta: {
        requestId: request.requestId
      }
    });
  });

  app.use("/v1/auth", authRouter);
  app.use("/v1/me", meRouter);
  app.use("/v1/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
