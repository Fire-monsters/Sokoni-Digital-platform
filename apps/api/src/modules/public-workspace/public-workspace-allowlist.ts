import type { NextFunction, Request, Response } from "express";
import {
  isAllowedPublicWorkspaceAction,
  type PublicWorkspaceContext,
} from "@sokoni-digital/domain";
import { sendError } from "../../http/responses.js";

export function assertPublicWorkspaceAction(
  context: PublicWorkspaceContext,
  action: string,
): void {
  if (!isAllowedPublicWorkspaceAction(context.kind, action)) {
    throw Object.assign(
      new Error(`Action '${action}' is not available for ${context.kind} workspace.`),
      {
        statusCode: 403,
        code: "ACTION_NOT_AVAILABLE",
      },
    );
  }
}

export function requirePublicAction(action: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const context = request.publicWorkspace;
    if (!context) {
      sendError(
        request,
        response,
        403,
        "FORBIDDEN",
        "Public workspace context is required for this action.",
      );
      return;
    }

    if (!isAllowedPublicWorkspaceAction(context.kind, action)) {
      sendError(
        request,
        response,
        403,
        "ACTION_NOT_AVAILABLE",
        `Action '${action}' is not available in the public ${context.kind} workspace.`,
      );
      return;
    }

    next();
  };
}
