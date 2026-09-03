import { describe, expect, it } from "vitest";
import type { StaffPermission, StaffRole } from "@sokoni-digital/domain";
import { navigation, visibleNavigation } from "../app/navigation";

const grants: Record<StaffRole, StaffPermission[]> = {
  admin: [
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
  ],
  agent: [
    "overview.read",
    "orders.read",
    "orders.support",
    "deliveries.read",
    "applications.read",
    "applications.review",
    "catalogue.read",
    "catalogue.review",
    "payments.read",
    "refunds.read",
    "users.read",
    "notifications.read",
    "notifications.manage",
    "reports.read",
    "audit.read",
  ],
  dispatcher: [
    "overview.read",
    "orders.read",
    "deliveries.read",
    "deliveries.manage",
    "reports.read",
  ],
  finance: [
    "overview.read",
    "orders.read",
    "deliveries.read",
    "payments.read",
    "payments.reconcile",
    "refunds.read",
    "refunds.manage",
    "settlements.read",
    "settlements.manage",
    "reports.read",
    "audit.read",
  ],
  viewer: ["overview.read", "reports.read", "audit.read"],
};
const expected: Record<StaffRole, string[]> = {
  admin: [
    "Overview",
    "Orders",
    "Deliveries",
    "Approvals",
    "Payments",
    "Refunds",
    "Settlements",
    "Users & Devices",
    "Notifications",
    "Reports",
    "Audit Log",
    "Settings",
  ],
  agent: [
    "Overview",
    "Orders",
    "Deliveries",
    "Approvals",
    "Payments",
    "Refunds",
    "Users & Devices",
    "Notifications",
    "Reports",
    "Audit Log",
  ],
  dispatcher: ["Overview", "Orders", "Deliveries", "Reports"],
  finance: [
    "Overview",
    "Orders",
    "Deliveries",
    "Payments",
    "Refunds",
    "Settlements",
    "Reports",
    "Audit Log",
  ],
  viewer: ["Overview", "Reports", "Audit Log"],
};
describe.each(Object.keys(grants) as StaffRole[])("%s security matrix", (role) => {
  it("shows exactly the allowed navigation", () => {
    const permissions = grants[role];
    expect(
      visibleNavigation(navigation, (permission) => permissions.includes(permission)).map(
        ({ label }) => label,
      ),
    ).toEqual(expected[role]);
  });
  it("cannot access a hidden workspace permission", () => {
    const permissions = grants[role];
    for (const item of navigation) {
      if (item.permission && !expected[role].includes(item.label))
        expect(permissions).not.toContain(item.permission);
    }
  });
});
