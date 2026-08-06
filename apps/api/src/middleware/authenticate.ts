import type { NextFunction, Request, Response } from "express";

export function authenticate(
  _request: Request,
  _response: Response,
  next: NextFunction
): void {
  next();
}
