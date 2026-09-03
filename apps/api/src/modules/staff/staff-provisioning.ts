import type { Database } from "@sokoni-digital/database-types";
import type { StaffRole } from "@sokoni-digital/domain";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface ProvisionStaffInput {
  email: string;
  password: string;
  displayName: string;
  role: StaffRole;
}
export interface ProvisionStaffResult {
  userId: string;
  email: string;
  role: StaffRole;
  created: boolean;
}

export async function provisionStaff(
  client: SupabaseClient<Database>,
  input: ProvisionStaffInput,
): Promise<ProvisionStaffResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await findUserByEmail(client, email);
  let user: User;
  let created = false;
  if (existing) user = existing;
  else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName },
    });
    if (error) throw error;
    user = data.user;
    created = true;
  }
  const { error } = await client
    .from("staff_members")
    .upsert(
      { user_id: user.id, role: input.role, status: "active", display_name: input.displayName },
      { onConflict: "user_id" },
    );
  if (error) {
    if (created) await client.auth.admin.deleteUser(user.id);
    throw error;
  }
  return { userId: user.id, email, role: input.role, created };
}

async function findUserByEmail(
  client: SupabaseClient<Database>,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error("Staff lookup exceeded the supported user pagination limit.");
}
