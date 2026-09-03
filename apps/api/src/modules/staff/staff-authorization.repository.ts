import type { StaffPermission, StaffRole, StaffStatus } from "@sokoni-digital/domain";
import { supabase } from "../../infrastructure/supabase/client.js";

export interface StaffAuthorization {
  userId: string;
  displayName: string;
  role: StaffRole;
  status: StaffStatus;
  permissions: StaffPermission[];
}

export interface StaffAuthorizationReader {
  findByUserId(userId: string): Promise<StaffAuthorization | null>;
}

export class StaffAuthorizationRepository implements StaffAuthorizationReader {
  async findByUserId(userId: string): Promise<StaffAuthorization | null> {
    const { data: staff, error: staffError } = await supabase
      .from("staff_members")
      .select("user_id, role, status, display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) return null;

    const { data: grants, error: grantsError } = await supabase
      .from("role_permissions")
      .select("permission")
      .eq("role", staff.role);
    if (grantsError) throw grantsError;

    return {
      userId: staff.user_id,
      displayName: staff.display_name,
      role: staff.role,
      status: staff.status,
      permissions: grants.map(({ permission }) => permission as StaffPermission),
    };
  }
}
