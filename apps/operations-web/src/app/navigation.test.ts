import { describe, expect, it } from "vitest";
import { navigation, routeTitles } from "./navigation";
describe("demo navigation", () => {
  it("exposes all workspaces without staff permissions", () => {
    const items = navigation.flatMap((item) => [item, ...(item.children ?? [])]);
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Overview",
        "Orders",
        "Deliveries",
        "Vendors",
        "Riders",
        "Listings",
        "Price changes",
        "Payments",
        "Audit Log",
        "Settings",
      ]),
    );
    expect(items.every((item) => !("permission" in item))).toBe(true);
    expect(routeTitles.get("/dashboard/payments")).toBe("Payments");
  });
});
