import type { StaffPermission } from "@sokoni-digital/domain";
import type { NextFunction, Request, Response } from "express";
import { sendError } from "../http/responses.js";
import {
  StaffAuthorizationRepository,
  type StaffAuthorizationReader,
} from "../modules/staff/staff-authorization.repository.js";

export function requireActiveStaff(
  repository: StaffAuthorizationReader = new StaffAuthorizationRepository(),
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = await resolveActiveStaff(request, response, repository);
      if (!staff) return;
      if (!request.auth) return;
      request.auth.staff = staff;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(
  permission: StaffPermission,
  repository: StaffAuthorizationReader = new StaffAuthorizationRepository(),
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = await resolveActiveStaff(request, response, repository);
      if (!staff) return;
      if (!staff.permissions.includes(permission)) {
        sendError(
          request,
          response,
          403,
          "FORBIDDEN",
          "This staff account lacks the required permission.",
        );
        return;
      }
      if (!request.auth) return;
      request.auth.staff = staff;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRoleOrPermission(
  allowedRoles: readonly string[],
  permission: StaffPermission,
  repository: StaffAuthorizationReader = new StaffAuthorizationRepository(),
) {
  const checkStaffPermission = requirePermission(permission, repository);
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (request.auth?.roles.some((role) => allowedRoles.includes(role))) {
      next();
      return;
    }
    await checkStaffPermission(request, response, next);
  };
}

async function resolveActiveStaff(
  request: Request,
  response: Response,
  repository: StaffAuthorizationReader,
) {
  if (!request.auth) {
    sendError(request, response, 401, "UNAUTHENTICATED", "Authentication is required.");
    return null;
  }
  const staff = request.auth.staff ?? (await repository.findByUserId(request.auth.userId));
  if (!staff) {
    sendError(
      request,
      response,
      403,
      "FORBIDDEN",
      "This account is not authorized for staff operations.",
    );
    return null;
  }
  if (staff.status !== "active") {
    sendError(
      request,
      response,
      403,
      "ACCOUNT_DISABLED",
      "This staff account is disabled. Contact an administrator.",
    );
    return null;
  }
  return staff;
}
