import type { NextFunction, Request, Response } from "express";

export function authorize(
  _request: Request,
  _response: Response,
  next: NextFunction
): void {
  next();
}
