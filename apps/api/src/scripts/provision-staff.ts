import "dotenv/config";
import { z } from "zod";
import { supabase } from "../infrastructure/supabase/client.js";
import { provisionStaff } from "../modules/staff/staff-provisioning.js";

function parseArguments(arguments_: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const argument of arguments_) {
    const normalized = argument.replace(/^--/, "");
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex < 1) continue;

    parsed[normalized.slice(0, separatorIndex)] = normalized.slice(separatorIndex + 1);
  }

  return parsed;
}

const args = parseArguments(process.argv.slice(2));
const input = z
  .object({
    email: z.email(),
    role: z.enum(["admin", "agent", "dispatcher", "finance", "viewer"]),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(12),
  })
  .parse({
    email: args.email,
    role: args.role,
    displayName: args["display-name"],
    password: process.env.STAFF_PROVISIONING_PASSWORD,
  });
const result = await provisionStaff(supabase, input);
console.log(
  `${result.created ? "Created" : "Updated"} ${result.email} as ${result.role} (${result.userId}).`,
);
