import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabase } from "../infrastructure/supabase/client.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
) as Record<string, string>;
const input = z
  .object({
    adminUserId: z.uuid(),
    ownerUserId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(300),
    operationId: z.uuid(),
  })
  .parse({
    adminUserId: args["admin-user-id"],
    ownerUserId: args["owner-user-id"],
    name: args.name,
    location: args.location,
    operationId: args["operation-id"] ?? randomUUID(),
  });
const { data, error } = await supabase.rpc("wholesale_provision_warehouse", {
  p_admin: input.adminUserId,
  p_owner: input.ownerUserId,
  p_name: input.name,
  p_location: input.location,
  p_operation: input.operationId,
});
if (error) throw new Error(`Could not provision warehouse: ${error.message}`);
console.log(`Warehouse ${data} provisioned for owner ${input.ownerUserId}.`);
