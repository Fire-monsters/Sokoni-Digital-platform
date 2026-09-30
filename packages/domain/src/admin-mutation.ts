export interface OperationMetadata {
  reason: string;
  expectedVersion: number;
  operationId: string;
}

export type AdminMutationCommand<TData> = {
  data: TData;
} & OperationMetadata;

export type AdminMutationErrorCode =
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "OPERATION_IN_PROGRESS"
  | "INVALID_STATE_TRANSITION"
  | "OPERATION_RESULT_PERSISTENCE_FAILED";

export interface AdminMutationErrorContext {
  operationId?: string;
  currentVersion?: number;
  retryable?: boolean;
}
