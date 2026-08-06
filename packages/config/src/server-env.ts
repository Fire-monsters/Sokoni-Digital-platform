import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: z.string().url(),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info")
});

export type ServerEnvironment = z.infer<typeof serverEnvSchema>;

export function parseServerEnvironment(
  source: NodeJS.ProcessEnv = process.env
): ServerEnvironment {
  const normalizedSource = {
    ...source,
    SUPABASE_PUBLISHABLE_KEY:
      source.SUPABASE_PUBLISHABLE_KEY ?? source.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY:
      source.SUPABASE_SECRET_KEY ?? source.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWKS_URL:
      source.SUPABASE_JWKS_URL && source.SUPABASE_JWKS_URL.length > 0
        ? source.SUPABASE_JWKS_URL
        : source.SUPABASE_URL
          ? `${source.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
          : undefined
  };

  const result = serverEnvSchema.safeParse(normalizedSource);

  if (!result.success) {
    console.error("Invalid server environment:", result.error.flatten().fieldErrors);
    throw new Error("Server environment validation failed");
  }

  return result.data;
}
