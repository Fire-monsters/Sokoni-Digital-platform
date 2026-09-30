import type { OperationMetadata, StaffPermission } from "@sokoni-digital/domain";
import { controlledMutationSchema } from "@sokoni-digital/validation/admin-mutation";
import type { RequestHandler } from "express";
import type { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../../http/responses.js";
import { requirePermission } from "../../../middleware/require-permission.js";
import type {
  StaffAuthorization,
  StaffAuthorizationReader,
} from "../../staff/staff-authorization.repository.js";
import { hashCanonicalRequest } from "../../idempotency/request-hash.js";
import {
  AdminMutationError,
  idempotencyKeyReused,
  normalizeAdminMutationError,
  operationInProgress,
} from "./admin-mutation.errors.js";
import {
  type AdminOperationRepository,
  SupabaseAdminOperationRepository,
} from "./admin-operation.repository.js";
import {
  type AdminOperationCoordinator,
  getAdminOperationCoordinator,
} from "./admin-operation.redis.js";

export interface AuditWriteContext {
  requestId: string;
  ipAddress: string;
  userAgent: string;
}

export interface AdminWorkflowCommand<TParams, TInput> {
  actor: StaffAuthorization;
  auditContext: AuditWriteContext;
  input: TInput;
  metadata: OperationMetadata;
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
  entityType?: string;
  entityId?: (params: z.output<TParamsSchema>, input: z.output<TBodySchema>) => string | null;
  operationRepository?: AdminOperationRepository;
  operationCoordinator?: AdminOperationCoordinator;
}

interface RequestLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

function requestLogger(request: Express.Request): RequestLogger | undefined {
  return (request as Express.Request & { log?: RequestLogger }).log;
}

const defaultOperationRepository = new SupabaseAdminOperationRepository();

function defaultEntityId(params: unknown): string | null {
  if (params === null || typeof params !== "object") return null;
  const match = Object.entries(params).find(
    ([key, value]) => key.toLowerCase().endsWith("id") && typeof value === "string",
  );
  return typeof match?.[1] === "string" ? match[1] : null;
}

function replayError(
  claim: {
    responseStatus: number;
    errorCode: string;
    errorMessage: string;
    currentVersion?: number;
  },
  operationId: string,
): Error {
  return Object.assign(new Error(claim.errorMessage), {
    statusCode: claim.responseStatus,
    code: claim.errorCode,
    operationId,
    retryable: false,
    ...(claim.currentVersion === undefined ? {} : { currentVersion: claim.currentVersion }),
  });
}

function errorPersistence(error: unknown): {
  responseStatus: number;
  errorCode: string;
  errorMessage: string;
  currentVersion?: number;
} {
  const candidate = error as {
    statusCode?: number;
    code?: string;
    message?: string;
    currentVersion?: number;
  };
  return {
    responseStatus: candidate.statusCode ?? 500,
    errorCode: candidate.code ?? "INTERNAL_ERROR",
    errorMessage:
      candidate.statusCode === undefined || candidate.statusCode >= 500
        ? "The administrative operation could not be completed."
        : (candidate.message ?? "The administrative operation could not be completed."),
    ...(candidate.currentVersion === undefined ? {} : { currentVersion: candidate.currentVersion }),
  };
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

    const metadata = controlledMutationSchema.safeParse(request.body);
    if (!metadata.success) {
      sendZodValidationError(request, response, metadata.error.issues);
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
      operationId: metadata.data.operationId,
    };

    const requestHash = hashCanonicalRequest({
      operation: definition.operation,
      params: params.data,
      body: body.data,
      metadata: metadata.data,
    });
    const operationRepository = definition.operationRepository ?? defaultOperationRepository;
    let coordinator: AdminOperationCoordinator | undefined = definition.operationCoordinator;
    let lockToken: string | null = null;
    let claimed = false;

    try {
      coordinator ??= await getAdminOperationCoordinator();
      let cachedOperation: Awaited<ReturnType<AdminOperationCoordinator["read"]>> = null;
      try {
        cachedOperation = await coordinator.read(metadata.data.operationId);
      } catch (error) {
        log?.error({ ...context, err: error }, "Redis operation coordination unavailable");
      }
      if (cachedOperation) {
        if (
          cachedOperation.actorStaffId !== actor.userId ||
          cachedOperation.operationType !== definition.operation ||
          cachedOperation.requestHash !== requestHash
        ) {
          throw idempotencyKeyReused(metadata.data.operationId);
        }
        response.setHeader("Idempotency-Replayed", "true");
        if (cachedOperation.outcome === "success") {
          sendSuccess(
            request,
            response,
            cachedOperation.responseStatus,
            cachedOperation.responseBody,
            {
              operation: { id: metadata.data.operationId, status: "completed", replayed: true },
            },
          );
          return;
        }
        throw replayError(
          {
            responseStatus: cachedOperation.responseStatus,
            errorCode: cachedOperation.errorCode ?? "INTERNAL_ERROR",
            errorMessage: cachedOperation.errorMessage ?? "The administrative operation failed.",
            ...(cachedOperation.currentVersion === undefined
              ? {}
              : { currentVersion: cachedOperation.currentVersion }),
          },
          metadata.data.operationId,
        );
      }
      try {
        lockToken = await coordinator.acquire(metadata.data.operationId);
      } catch (error) {
        // Postgres is the authoritative lock. Redis outages must not make the
        // administrative control plane unavailable.
        lockToken = "postgres-only";
        log?.error({ ...context, err: error }, "Redis operation lock unavailable");
      }

      const claim = await operationRepository.claim({
        operationId: metadata.data.operationId,
        actorStaffId: actor.userId,
        operationType: definition.operation,
        entityType: definition.entityType ?? definition.operation.split(".")[0] ?? "admin",
        entityId: definition.entityId
          ? definition.entityId(params.data, body.data)
          : defaultEntityId(params.data),
        requestHash,
        reason: metadata.data.reason,
        expectedVersion: metadata.data.expectedVersion,
      });
      if (claim.action === "conflict") throw idempotencyKeyReused(metadata.data.operationId);
      if (claim.action === "in_progress") throw operationInProgress(metadata.data.operationId);
      if (claim.action === "replay") {
        response.setHeader("Idempotency-Replayed", "true");
        if (claim.outcome === "success") {
          sendSuccess(request, response, claim.responseStatus, claim.responseBody, {
            operation: { id: metadata.data.operationId, status: "completed", replayed: true },
          });
          return;
        }
        throw replayError(claim, metadata.data.operationId);
      }
      if (lockToken === null) throw operationInProgress(metadata.data.operationId);
      claimed = true;

      const result = await definition.execute({
        actor,
        auditContext: {
          requestId: request.requestId,
          ipAddress: request.ip ?? "unknown",
          userAgent: request.get("user-agent") ?? "unknown",
        },
        input: body.data,
        metadata: metadata.data,
        params: params.data,
        requestId: request.requestId,
      });
      const successStatus = definition.successStatus ?? 200;
      try {
        await operationRepository.complete(metadata.data.operationId, successStatus, result);
      } catch {
        throw new AdminMutationError(
          503,
          "OPERATION_RESULT_PERSISTENCE_FAILED",
          "The operation completed, but its replay result could not be persisted. Retry with the same operation ID.",
          metadata.data.operationId,
          undefined,
          true,
        );
      }
      try {
        await coordinator.write(metadata.data.operationId, {
          actorStaffId: actor.userId,
          operationType: definition.operation,
          requestHash,
          outcome: "success",
          responseStatus: successStatus,
          responseBody: result,
        });
      } catch (error) {
        log?.error({ ...context, err: error }, "Redis operation result cache write failed");
      }
      log?.info(
        { ...context, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 },
        "Admin workflow completed",
      );
      sendSuccess(request, response, successStatus, result, {
        operation: { id: metadata.data.operationId, status: "completed", replayed: false },
      });
    } catch (rawError) {
      const error = normalizeAdminMutationError(rawError, metadata.data.operationId);
      if (claimed) {
        const failure = errorPersistence(error);
        // Persist deterministic client/domain failures. For server or network
        // failures, leave the short Postgres lease in place so a same-ID retry
        // can safely recover through the domain operation's own idempotency.
        if (failure.responseStatus < 500) {
          try {
            await operationRepository.fail(metadata.data.operationId, failure);
            await coordinator?.write(metadata.data.operationId, {
              actorStaffId: actor.userId,
              operationType: definition.operation,
              requestHash,
              outcome: "error",
              responseStatus: failure.responseStatus,
              errorCode: failure.errorCode,
              errorMessage: failure.errorMessage,
              ...(failure.currentVersion === undefined
                ? {}
                : { currentVersion: failure.currentVersion }),
            });
          } catch (persistenceError) {
            log?.error(
              { ...context, err: persistenceError },
              "Admin operation failure result could not be persisted",
            );
          }
        }
      }
      log?.error(
        {
          ...context,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          err: error,
        },
        "Admin workflow failed",
      );
      next(error);
    } finally {
      if (coordinator && lockToken && lockToken !== "postgres-only") {
        try {
          await coordinator.release(metadata.data.operationId, lockToken);
        } catch (error) {
          log?.error({ ...context, err: error }, "Redis operation lock release failed");
        }
      }
    }
  };

  return [permissionCheck, execute];
}
