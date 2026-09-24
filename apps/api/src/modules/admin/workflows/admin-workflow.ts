import type { StaffPermission } from "@sokoni-digital/domain";
import type { RequestHandler } from "express";
import type { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../../http/responses.js";
import { requirePermission } from "../../../middleware/require-permission.js";
import type {
  StaffAuthorization,
  StaffAuthorizationReader,
} from "../../staff/staff-authorization.repository.js";

export interface AuditWriteContext {
  requestId: string;
  ipAddress: string;
  userAgent: string;
}

export interface AdminWorkflowCommand<TParams, TInput> {
  actor: StaffAuthorization;
  auditContext: AuditWriteContext;
  input: TInput;
  params: TParams;
  requestId: string;
}

interface AdminWorkflowDefinition<
  TParamsSchema extends z.ZodType,
  TBodySchema extends z.ZodType,
  TResult,
> {
  operation: string;
  permission: StaffPermission;
  paramsSchema: TParamsSchema;
  bodySchema: TBodySchema;
  execute: (
    command: AdminWorkflowCommand<z.output<TParamsSchema>, z.output<TBodySchema>>,
  ) => Promise<TResult>;
  successStatus?: number;
  authorizationReader?: StaffAuthorizationReader;
}

interface RequestLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

function requestLogger(request: Express.Request): RequestLogger | undefined {
  return (request as Express.Request & { log?: RequestLogger }).log;
}

/**
 * Builds the complete HTTP boundary for an authenticated staff workflow.
 * Routers remain responsible for authentication once at router level; this
 * boundary guarantees authorization, validation and actor/request context for
 * each individual business action.
 */

export function createAdminWorkflowRoute<
  TParamsSchema extends z.ZodType,
  TBodySchema extends z.ZodType,
  TResult,
>(definition: AdminWorkflowDefinition<TParamsSchema, TBodySchema, TResult>): RequestHandler[] {
  const permissionCheck = definition.authorizationReader
    ? requirePermission(definition.permission, definition.authorizationReader)
    : requirePermission(definition.permission);

  const execute: RequestHandler = async (request, response, next) => {
    const params = definition.paramsSchema.safeParse(request.params);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    const body = definition.bodySchema.safeParse(request.body);
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    const actor = request.auth?.staff;
    if (!actor) {
      next(new Error("Staff authorization context is missing after permission validation."));
      return;
    }

    const startedAt = performance.now();
    const log = requestLogger(request);
    const context = {
      event: "admin_workflow",
      operation: definition.operation,
      permission: definition.permission,
      requestId: request.requestId,
      staffId: actor.userId,
      staffRole: actor.role,
    };

    try {
      const result = await definition.execute({
        actor,
        auditContext: {
          requestId: request.requestId,
          ipAddress: request.ip ?? "unknown",
          userAgent: request.get("user-agent") ?? "unknown",
        },
        input: body.data,
        params: params.data,
        requestId: request.requestId,
      });
      log?.info(
        { ...context, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 },
        "Admin workflow completed",
      );
      sendSuccess(request, response, definition.successStatus ?? 200, result);
    } catch (error) {
      log?.error(
        {
          ...context,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          err: error,
        },
        "Admin workflow failed",
      );
      next(error);
    }
  };

  return [permissionCheck, execute];
}
