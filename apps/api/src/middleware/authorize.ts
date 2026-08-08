import type { NextFunction, Request, Response } from "express";

import { sendError } from "../http/responses.js";

export function authorize(allowedRoles: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.auth) {
      sendError(request, response, 401, "UNAUTHENTICATED", "Authentication is required.");
      return;
    }

    if (!request.auth.roles.some((role) => allowedRoles.includes(role))) {
      sendError(request, response, 403, "FORBIDDEN", "This account cannot perform that action.");
      return;
    }

    next();
  };
}
