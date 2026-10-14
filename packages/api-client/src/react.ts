"use client";
import { createElement, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
  type QueryFunction,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ApiError, apiErrorMessage, shouldRetryRead, toApiError } from "./transport";

export function createFrontendQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryRead,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
export function ApiProvider({ children, client: provided }: { children: ReactNode; client?: QueryClient }) {
  const [client] = useState(createFrontendQueryClient);
  return createElement(QueryClientProvider, { client: provided ?? client }, children);
}
export function useApiQuery<T>(
  options: Omit<UseQueryOptions<T, ApiError>, "queryFn" | "retry"> & {
    queryFn: QueryFunction<T>;
  },
) {
  return useQuery<T, ApiError>({
    ...options,
    retry: shouldRetryRead,
    queryFn: async (context) => {
      try {
        return await options.queryFn(context);
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}
export function apiMutationOptions<T, Input>(
  client: QueryClient,
  options: {
    mutationFn: (input: Input) => Promise<T>;
    invalidate: readonly QueryKey[] | ((data: T, input: Input) => readonly QueryKey[]);
  },
) {
  return {
    retry: false as const,
    mutationFn: async (input: Input) => {
      try {
        return await options.mutationFn(input);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 409 || error.code === "VERSION_CONFLICT")) {
          const keys = typeof options.invalidate === "function" ? [] : options.invalidate;
          await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
        }
        throw toApiError(error);
      }
    },
    onSuccess: async (data: T, input: Input) => {
      const keys =
        typeof options.invalidate === "function"
          ? options.invalidate(data, input)
          : options.invalidate;
      await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  };
}
export function useApiMutation<T, Input>(
  options: Parameters<typeof apiMutationOptions<T, Input>>[1],
) {
  const client = useQueryClient();
  return useMutation<T, ApiError, Input>(apiMutationOptions(client, options));
}
/** Minimal accessible feedback; can also be composed with each dashboard's existing styles. */
export function ApiFeedback({
  pending,
  refreshing,
  error,
  onRetry,
}: {
  pending?: boolean;
  refreshing?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (error) {
    const failure = toApiError(error);
    return createElement(
      "div",
      { role: "alert" },
      createElement("p", null, apiErrorMessage(failure)),
      createElement(
        "small",
        null,
        `${failure.code}${failure.requestId ? ` · Request ${failure.requestId}` : ""}`,
      ),
      onRetry ? createElement("button", { type: "button", onClick: onRetry }, "Retry") : null,
    );
  }
  return pending || refreshing
    ? createElement(
        "p",
        { role: "status", "aria-live": "polite" },
        pending ? "Loading…" : "Refreshing…",
      )
    : null;
}
