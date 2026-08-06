import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
      requestId: request.requestId
    }
  });
}
