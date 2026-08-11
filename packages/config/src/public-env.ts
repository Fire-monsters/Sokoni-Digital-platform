import { z } from "zod";

const publicEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(1),
  apiUrl: z.url(),
});

export type PublicEnvironment = z.infer<typeof publicEnvSchema>;

export function parsePublicEnvironment(input: unknown): PublicEnvironment {
  return publicEnvSchema.parse(input);
}
