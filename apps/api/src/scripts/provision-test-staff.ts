import "dotenv/config";
import { supabase } from "../infrastructure/supabase/client.js";
import { provisionStaff } from "../modules/staff/staff-provisioning.js";

if (process.env.NODE_ENV === "production")
  throw new Error("Test staff provisioning is disabled in production.");
const password = process.env.STAFF_PROVISIONING_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set STAFF_PROVISIONING_PASSWORD to at least 12 characters.");
const domain = process.env.STAFF_TEST_EMAIL_DOMAIN ?? "sokoni.local";
const staff = [
  { role: "admin", displayName: "Test Administrator" },
  { role: "agent", displayName: "Test Operations Agent" },
  { role: "dispatcher", displayName: "Test Dispatcher" },
  { role: "finance", displayName: "Test Finance" },
  { role: "viewer", displayName: "Test Viewer" },
] as const;
for (const member of staff) {
  const result = await provisionStaff(supabase, {
    ...member,
    email: `${member.role}@${domain}`,
    password,
  });
  console.log(`${result.created ? "Created" : "Updated"} ${result.email} as ${result.role}.`);
}
