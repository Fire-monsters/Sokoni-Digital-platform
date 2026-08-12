import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const incomingRequestId = request.header("x-request-id");

  request.requestId =
    incomingRequestId && incomingRequestId.length <= 128 ? incomingRequestId : randomUUID();

  response.setHeader("x-request-id", request.requestId);

  next();
}
