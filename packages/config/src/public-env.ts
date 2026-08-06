import { z } from "zod";

const publicEnvSchema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
  apiUrl: z.string().url()
});

export type PublicEnvironment = z.infer<typeof publicEnvSchema>;

export function parsePublicEnvironment(input: unknown): PublicEnvironment {
  return publicEnvSchema.parse(input);
}
