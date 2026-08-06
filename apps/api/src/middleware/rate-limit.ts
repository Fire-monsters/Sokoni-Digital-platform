import type { NextFunction, Request, Response } from "express";

export function rateLimit(
  _request: Request,
  _response: Response,
  next: NextFunction
): void {
  next();
}
