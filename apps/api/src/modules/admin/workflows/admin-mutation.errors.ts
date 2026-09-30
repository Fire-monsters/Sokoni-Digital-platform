import type { AdminMutationErrorCode } from "@sokoni-digital/domain";

export class AdminMutationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: AdminMutationErrorCode,
    message: string,
    readonly operationId?: string,
    readonly currentVersion?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AdminMutationError";
  }
}

export function versionConflict(operationId?: string, currentVersion?: number): AdminMutationError {
  return new AdminMutationError(
    409,
    "VERSION_CONFLICT",
    "This record changed after it was loaded. Refresh it and reconsider the operation.",
    operationId,
    currentVersion,
  );
}

export function idempotencyKeyReused(operationId: string): AdminMutationError {
  return new AdminMutationError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "This operation ID was already used with different request details.",
    operationId,
  );
}

export function operationInProgress(operationId: string): AdminMutationError {
  return new AdminMutationError(
    409,
    "OPERATION_IN_PROGRESS",
    "The original operation is still processing. Retry with the same operation ID.",
    operationId,
    undefined,
    true,
  );
}

export function normalizeAdminMutationError(error: unknown, operationId?: string) {
  if (error instanceof AdminMutationError) return error;
  const candidate = error as {
    statusCode?: number;
    code?: string;
    message?: string;
    currentVersion?: number;
    retryable?: boolean;
  };
  if (candidate.code === "VERSION_CONFLICT" || candidate.code === "CART_VERSION_CONFLICT") {
    return versionConflict(operationId, candidate.currentVersion);
  }
  if (
    candidate.statusCode === 409 &&
    /operation (?:id|key).*(?:reus|already used|different|another request)|operation belongs to another request/i.test(
      candidate.message ?? "",
    ) &&
    operationId
  ) {
    return idempotencyKeyReused(operationId);
  }
  if (candidate.statusCode === 409 && /version|changed|refresh/i.test(candidate.message ?? "")) {
    return versionConflict(operationId, candidate.currentVersion);
  }
  return error;
}

export function mapPostgresAdminMutationError(
  error: { code?: string; message: string; details?: string | null },
  operationId?: string,
): AdminMutationError | null {
  if (error.code !== "40001") return null;
  const versionText = error.details?.match(/(?:current(?:Version)?[=: ]+)(\d+)/i)?.[1];
  return versionConflict(operationId, versionText === undefined ? undefined : Number(versionText));
}
