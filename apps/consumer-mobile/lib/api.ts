import type { ApiClientOptions } from "@sokoni-digital/api-client";

export const publicApiOptions: ApiClientOptions = {
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
};
