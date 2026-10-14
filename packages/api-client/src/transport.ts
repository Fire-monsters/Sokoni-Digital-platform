/** Public HTTP configuration only. Never accepts server identities or credentials. */
export interface ApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  /** Explicit adapter for the same admin contracts behind a public workspace boundary. */
  adminBasePath?: string;
  responseMode?: "envelope" | "raw";
}
export type ApiFailureKind = "http" | "network" | "aborted" | "invalid-response" | "unavailable";
interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  operationId?: string;
  currentVersion?: number;
  retryable?: boolean;
}
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly operationId: string | undefined;
  readonly currentVersion: number | undefined;
  readonly retryable: boolean | undefined;
  readonly kind: ApiFailureKind;
  get status() {
    return this.statusCode;
  }
  constructor(status: number, error: ErrorPayload, kind: ApiFailureKind = "http") {
    super(error.message);
    this.name = "ApiError";
    this.statusCode = status;
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
    this.operationId = error.operationId;
    this.currentVersion = error.currentVersion;
    this.retryable = error.retryable;
    this.kind = kind;
  }
}
/** Legacy HTTP-only subclass: mobile offline queues distinguish server rejection from transport failure. */
export class ApiClientError extends ApiError {
  constructor(status: number, error: ErrorPayload, kind: ApiFailureKind = "http") {
    super(status, error, kind);
    this.name = "ApiClientError";
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const aborted = error instanceof Error && error.name === "AbortError";
  return new ApiError(
    0,
    {
      code: aborted ? "REQUEST_ABORTED" : "UNEXPECTED_ERROR",
      message: aborted ? "Request cancelled." : "An unexpected response occurred.",
      details: error,
    },
    aborted ? "aborted" : "invalid-response",
  );
}
export function unavailable(message = "This action is currently unavailable."): never {
  throw new ApiClientError(503, { code: "UNAVAILABLE", message, retryable: false }, "unavailable");
}
/** Never render raw backend messages, details or stack traces. */
export function apiErrorMessage(error: unknown): string {
  const failure = toApiError(error);
  if (failure.code === "UNAVAILABLE" || failure.code === "ACTION_NOT_AVAILABLE")
    return "This action is currently unavailable.";
  if (failure.kind === "network")
    return "Unable to reach the service. Check your connection and retry.";
  if (failure.kind === "aborted") return "Request cancelled.";
  if (failure.kind === "invalid-response") return "The service returned an unexpected response.";
  if ([401, 403].includes(failure.status)) return "You do not have access to this action.";
  return "The request could not be completed. Please try again.";
}
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    error instanceof ApiError &&
    error.retryable !== false &&
    error.code !== "UNAVAILABLE" &&
    error.kind !== "unavailable" &&
    (error.kind === "network" || (error.kind === "http" && [502, 503, 504].includes(error.status)))
  );
}
export type ApiRequestOptions = Omit<RequestInit, "method" | "body"> & {
  onResponse?: (metadata: { status: number; requestId?: string }) => void;
};
export async function requestApi<T>(
  options: ApiClientOptions,
  path: string,
  init: RequestInit & Pick<ApiRequestOptions, "onResponse"> = {},
): Promise<T> {
  const requestPath = options.adminBasePath && path.startsWith("/v1/admin/")
    ? options.adminBasePath + path.slice("/v1/admin".length) : path;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (options.accessToken) headers.set("authorization", `Bearer ${options.accessToken}`);
  const { onResponse, ...request } = init;
  let response: Response;
  let body: string;
  try {
    response = await fetch(`${options.baseUrl.replace(/\/$/, "")}${requestPath}`, { ...request, headers });
    body = await response.text();
  } catch (error) {
    if (init.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new ApiError(0, { code: "REQUEST_ABORTED", message: "Request cancelled." }, "aborted");
    }
    throw new ApiError(
      0,
      { code: "NETWORK_ERROR", message: "Network request failed.", details: error },
      "network",
    );
  }
  let payload: unknown;
  let invalidJson = false;
  if (body.trim()) {
    try {
      payload = JSON.parse(body);
    } catch {
      invalidJson = true;
    }
  }
  const envelope = record(payload) ? payload : undefined;
  const error = envelope && record(envelope.error) ? envelope.error : envelope;
  const meta = envelope && record(envelope.meta) ? envelope.meta : undefined;
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-correlation-id") ??
    (typeof error?.requestId === "string" ? error.requestId : undefined) ??
    (typeof meta?.requestId === "string" ? meta.requestId : undefined);
  const metadata = { status: response.status, ...(requestId ? { requestId } : {}) };
  onResponse?.(metadata);
  if (!response.ok || envelope?.success === false) {
    throw new ApiClientError(response.status, {
      code: typeof error?.code === "string" ? error.code : "HTTP_ERROR",
      message:
        typeof error?.message === "string"
          ? error.message
          : `Request failed (${String(response.status)}).`,
      details: error?.details,
      ...(requestId ? { requestId } : {}),
      ...(typeof error?.operationId === "string" ? { operationId: error.operationId } : {}),
      ...(typeof error?.currentVersion === "number"
        ? { currentVersion: error.currentVersion }
        : {}),
      ...(typeof error?.retryable === "boolean" ? { retryable: error.retryable } : {}),
    });
  }
  if (!body.trim()) return undefined as T;
  if (
    invalidJson ||
    (options.responseMode !== "raw" && (envelope?.success !== true || !("data" in envelope)))
  ) {
    throw new ApiError(
      response.status,
      {
        code: "INVALID_RESPONSE",
        message: "Invalid API response.",
        ...(requestId ? { requestId } : {}),
      },
      "invalid-response",
    );
  }
  return (options.responseMode === "raw" ? payload : envelope?.data) as T;
}
export function createApiClient(config: ApiClientOptions) {
  return {
    get: <T>(path: string, options?: ApiRequestOptions) =>
      requestApi<T>(config, path, { ...options, method: "GET" }),
    // Explicit body generics let callers check a DTO independent of the inferred input.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    post: <T, B>(path: string, body: B, options?: ApiRequestOptions) =>
      requestApi<T>(config, path, { ...options, method: "POST", body: JSON.stringify(body) }),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    patch: <T, B>(path: string, body: B, options?: ApiRequestOptions) =>
      requestApi<T>(config, path, { ...options, method: "PATCH", body: JSON.stringify(body) }),
    delete: <T = void>(path: string, options?: ApiRequestOptions) =>
      requestApi<T>(config, path, { ...options, method: "DELETE" }),
  };
}
export interface FrontendConfig {
  readonly apiUrl: string;
  readonly demoEnabled: boolean;
}
export function createFrontendConfig(input: {
  apiUrl?: string;
  demo?: string;
  production: boolean;
}): FrontendConfig {
  const apiUrl = input.apiUrl?.trim() ?? "";
  if (apiUrl && !/^https?:\/\//.test(apiUrl) && !/^\/(?!\/)/.test(apiUrl))
    throw new Error("Public API URL must use HTTP(S) or a same-origin path.");
  return Object.freeze({
    apiUrl: apiUrl.replace(/\/$/, ""),
    demoEnabled: !input.production && input.demo === "true",
  });
}
