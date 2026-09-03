export type StaffRole = "admin" | "agent" | "dispatcher" | "finance" | "viewer";
export type StaffStatus = "active" | "suspended" | "disabled";
export const staffPermissions = [
  "overview.read",
  "orders.read",
  "orders.support",
  "deliveries.read",
  "deliveries.manage",
  "applications.read",
  "applications.review",
  "catalogue.read",
  "catalogue.review",
  "payments.read",
  "payments.reconcile",
  "refunds.read",
  "refunds.manage",
  "settlements.read",
  "settlements.manage",
  "users.read",
  "users.manage",
  "notifications.read",
  "notifications.manage",
  "reports.read",
  "audit.read",
  "settings.manage",
] as const;
export type StaffPermission = (typeof staffPermissions)[number];

export interface StaffSession {
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  status: StaffStatus;
  permissions: StaffPermission[];
}
