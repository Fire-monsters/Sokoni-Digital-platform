import type { NextFunction, Request, Response } from "express";

export function notFound(request: Request, _response: Response, next: NextFunction): void {
  const error = Object.assign(
    new Error(`Route not found: ${request.method} ${request.originalUrl}`),
    { statusCode: 404, code: "NOT_FOUND" },
  );
  next(error);
}
