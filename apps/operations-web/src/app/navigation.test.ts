import { describe, expect, it } from "vitest";
import type { StaffPermission } from "@sokoni-digital/domain";
import { navigation, visibleNavigation } from "./navigation";
const visibleFor = (permissions: StaffPermission[]) =>
  visibleNavigation(navigation, (permission) => permissions.includes(permission));
describe("permission-aware navigation", () => {
  it("shows a dispatcher only operational areas", () => {
    const labels = visibleFor([
      "overview.read",
      "orders.read",
      "deliveries.read",
      "deliveries.manage",
      "reports.read",
    ]).map(({ label }) => label);
    expect(labels).toEqual(["Overview", "Orders", "Deliveries", "Reports"]);
  });
  it("keeps approvals when at least one child is permitted", () => {
    const result = visibleFor(["catalogue.read"]);
    expect(result[0]?.children?.map(({ label }) => label)).toEqual(["Listings", "Price changes"]);
  });
  it("does not expose management areas to a viewer", () => {
    const labels = visibleFor(["overview.read", "reports.read", "audit.read"]).map(
      ({ label }) => label,
    );
    expect(labels).toEqual(["Overview", "Reports", "Audit Log"]);
  });
});
