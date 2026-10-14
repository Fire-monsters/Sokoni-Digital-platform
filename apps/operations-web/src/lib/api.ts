import { createApiClient, createFrontendConfig } from "@sokoni-digital/api-client";
export const frontendConfig = createFrontendConfig({
  apiUrl: import.meta.env.VITE_API_URL,
  demo: import.meta.env.VITE_DEMO_ENABLED,
  production: import.meta.env.PROD,
});
export const api = createApiClient({ baseUrl: frontendConfig.apiUrl });
