import type { NextFunction, Request, Response } from "express";

export function notFound(request: Request, _response: Response, next: NextFunction): void {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`);
  next(error);
}
