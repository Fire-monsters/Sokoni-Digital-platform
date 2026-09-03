import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    SUPABASE_JWKS_URL: z.url(),

    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    CHECKOUT_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    PAYMENTS_ENV: z.enum(["fake", "sandbox", "production"]).default("fake"),
    PAYMENT_CALLBACK_BASE_URL: z.url().default("http://localhost:4000/v1/payments"),
    PAYMENT_APP_RETURN_URL: z.string().min(1).default("consumermobile://payments/return"),
    PAYMENT_PENDING_MAX_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    PAYMENT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    PAYMENT_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
    PESAPAL_CONSUMER_KEY: z.string().min(1).optional(),
    PESAPAL_CONSUMER_SECRET: z.string().min(1).optional(),
    PESAPAL_IPN_ID: z.uuid().optional(),
    NOTIFICATION_DELIVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    NOTIFICATION_RETRY_BASE_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    NOTIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(300000).default(15000),
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    RIDER_OFFER_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
    RIDER_OFFER_EXPIRY_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300000)
      .default(15000),
    YOOLA_SMS_API_KEY: z.string().min(1).optional(),
    SUPABASE_AUTH_SEND_SMS_HOOK_SECRETS: z
      .string()
      .regex(/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/, "Use the v1,whsec_<base64-secret> format.")
      .optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.PAYMENTS_ENV === "fake") {
      context.addIssue({
        code: "custom",
        path: ["PAYMENTS_ENV"],
        message: "Fake payments cannot be enabled in production.",
      });
    }
    if (environment.PAYMENTS_ENV === "fake") return;
    for (const key of [
      "PESAPAL_CONSUMER_KEY",
      "PESAPAL_CONSUMER_SECRET",
      "PESAPAL_IPN_ID",
    ] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when Pesapal payments are enabled.`,
        });
      }
    }
    if (!environment.PAYMENT_CALLBACK_BASE_URL.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        path: ["PAYMENT_CALLBACK_BASE_URL"],
        message: "Pesapal callback base URL must use HTTPS outside fake mode.",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvSchema>;

export function parseServerEnvironment(source: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  const normalizedSource = {
    ...source,
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY ?? source.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY ?? source.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWKS_URL:
      source.SUPABASE_JWKS_URL && source.SUPABASE_JWKS_URL.length > 0
        ? source.SUPABASE_JWKS_URL
        : source.SUPABASE_URL
          ? `${source.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
          : undefined,
  };

  const result = serverEnvSchema.safeParse(normalizedSource);

  if (!result.success) {
    console.error("Invalid server environment:", z.treeifyError(result.error));
    throw new Error("Server environment validation failed");
  }

  return result.data;
}
