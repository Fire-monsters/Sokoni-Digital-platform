import type { NextFunction, Request, Response } from "express";

export function authorize(_allowedRoles: readonly string[]) {
  return (_request: Request, _response: Response, next: NextFunction): void => {
    next();
  };
}
