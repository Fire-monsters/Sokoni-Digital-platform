import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const typedError = error as {
    statusCode?: number;
    code?: string;
    message?: string;
  };
  const statusCode = typedError.statusCode ?? 500;
  const message = error instanceof Error ? error.message : "An unexpected error occurred";

  response.status(statusCode).json({
    success: false,
    error: {
      code: typedError.code ?? "INTERNAL_ERROR",
      message,
      requestId: request.requestId,
    },
  });
}
