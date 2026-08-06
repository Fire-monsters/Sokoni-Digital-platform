import type { ApiErrorResponse, ApiSuccessResponse, AuthenticatedProfile, OnboardingSnapshot } from "@sokoni-digital/domain";

export const apiQueryKeys = {
  me: ["me"] as const,
  onboarding: ["me", "onboarding"] as const
};

export interface ApiClientOptions {
  baseUrl: string;
  accessToken?: string;
}

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorResponse["error"]["details"];

  constructor(statusCode: number, error: ApiErrorResponse["error"]) {
    super(error.message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = error.code;
    this.details = error.details;
  }
}

export async function requestApi<T>(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  if (options.accessToken) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers
  });
  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!payload.success) {
    throw new ApiClientError(response.status, payload.error);
  }

  return payload.data;
}

export function fetchMe(options: ApiClientOptions): Promise<AuthenticatedProfile> {
  return requestApi<AuthenticatedProfile>(options, "/v1/me");
}

export function fetchOnboarding(options: ApiClientOptions): Promise<OnboardingSnapshot> {
  return requestApi<OnboardingSnapshot>(options, "/v1/me/onboarding");
}
