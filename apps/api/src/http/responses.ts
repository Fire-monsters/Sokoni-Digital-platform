import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse, ApiSuccessResponse } from "@sokoni-digital/domain";
import type { Request, Response } from "express";
import type { z } from "zod";

export function sendSuccess(
  request: Request,
  response: Response,
  statusCode: number,
  data: unknown
): void {
  const payload: ApiSuccessResponse<unknown> = {
    success: true,
    data,
    meta: {
      requestId: request.requestId
    }
  };

  response.status(statusCode).json(payload);
}

export function sendError(
  request: Request,
  response: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[]
): void {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      requestId: request.requestId,
      ...(details && details.length > 0 ? { details } : {})
    }
  };

  response.status(statusCode).json(payload);
}

export function sendZodValidationError(
  request: Request,
  response: Response,
  issues: z.core.$ZodIssue[]
): void {
  sendError(
    request,
    response,
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    issues.map((issue) => ({
      field: issue.path.join("."),
      issue: issue.message
    }))
  );
}
