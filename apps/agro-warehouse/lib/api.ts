import { createApiClient, createFrontendConfig } from "@sokoni-digital/api-client";
export const frontendConfig = createFrontendConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  demo: process.env.NEXT_PUBLIC_DEMO_ENABLED,
  production: process.env.NODE_ENV === "production",
});
export const api = createApiClient({ baseUrl: frontendConfig.apiUrl });
