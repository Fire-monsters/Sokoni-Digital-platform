import cors from "cors";
import express from "express";
import type { Request } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";

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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
