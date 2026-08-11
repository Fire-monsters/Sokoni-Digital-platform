/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import type { NextFunction, Request, Response } from "express";

import { hashCanonicalRequest } from "./request-hash.js";
import { IdempotencyRepository } from "./idempotency.repository.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      idempotency?: { key: string; recordId: string; repository: IdempotencyRepository };
    }
  }
}

function error(
  response: Response,
  request: Request,
  status: number,
  code: string,
  message: string,
): void {
  response
    .status(status)
    .json({ success: false, error: { code, message, requestId: request.requestId } });
}

export function requireIdempotency(operation: string, repository = new IdempotencyRepository()) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const key = request.header("idempotency-key");
    if (!key)
      return error(
        response,
        request,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required.",
      );
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      return error(
        response,
        request,
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must be a UUID.",
      );
    }
    if (!request.auth)
      return error(response, request, 401, "UNAUTHENTICATED", "Authentication is required.");
    try {
      const requestBody: unknown = request.body;
      const requestParams: unknown = request.params;
      const claim = await repository.claim(
        request.auth.userId,
        operation,
        key,
        hashCanonicalRequest({ body: requestBody, params: requestParams }),
      );
      if (claim.action === "conflict")
        return error(
          response,
          request,
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "This key was already used with another request.",
        );
      if (claim.action === "in_progress")
        return error(
          response,
          request,
          409,
          "REQUEST_IN_PROGRESS",
          "The original request is still processing.",
        );
      if (claim.action === "replay") {
        response.setHeader("idempotency-replayed", "true");
        response.status(claim.responseStatus).json(claim.responseBody);
        return;
      }
      request.idempotency = { key, recordId: claim.recordId, repository };
      next();
    } catch (cause) {
      next(cause);
    }
  };
}
