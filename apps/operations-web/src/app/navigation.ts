import type { StaffPermission } from "@sokoni-digital/domain";
export type NavigationItem = {
  label: string;
  path: string;
  icon: string;
  permission?: StaffPermission;
  children?: NavigationItem[];
};
export const navigation: NavigationItem[] = [
  { label: "Overview", path: "/dashboard/overview", icon: "grid", permission: "overview.read" },
  { label: "Orders", path: "/dashboard/orders", icon: "receipt", permission: "orders.read" },
  {
    label: "Deliveries",
    path: "/dashboard/deliveries",
    icon: "truck",
    permission: "deliveries.read",
  },
  {
    label: "Approvals",
    path: "/dashboard/approvals",
    icon: "check",
    children: [
      {
        label: "Vendors",
        path: "/dashboard/approvals/vendors",
        icon: "store",
        permission: "applications.read",
      },
      {
        label: "Riders",
        path: "/dashboard/approvals/riders",
        icon: "bike",
        permission: "applications.read",
      },
      {
        label: "Listings",
        path: "/dashboard/approvals/listings",
        icon: "box",
        permission: "catalogue.read",
      },
      {
        label: "Price changes",
        path: "/dashboard/approvals/price-changes",
        icon: "tag",
        permission: "catalogue.read",
      },
    ],
  },
  { label: "Payments", path: "/dashboard/payments", icon: "card", permission: "payments.read" },
  { label: "Refunds", path: "/dashboard/refunds", icon: "refund", permission: "refunds.read" },
  {
    label: "Settlements",
    path: "/dashboard/settlements",
    icon: "wallet",
    permission: "settlements.read",
  },
  { label: "Users & Devices", path: "/dashboard/users", icon: "users", permission: "users.read" },
  {
    label: "Notifications",
    path: "/dashboard/notifications",
    icon: "bell",
    permission: "notifications.read",
  },
  { label: "Reports", path: "/dashboard/reports", icon: "chart", permission: "reports.read" },
  { label: "Audit Log", path: "/dashboard/audit", icon: "shield", permission: "audit.read" },
  {
    label: "Settings",
    path: "/dashboard/settings",
    icon: "settings",
    permission: "settings.manage",
  },
];
export function visibleNavigation(
  items: NavigationItem[],
  can: (permission: StaffPermission) => boolean,
): NavigationItem[] {
  return items.reduce<NavigationItem[]>((visible, item) => {
    const children = item.children?.filter((child) => child.permission && can(child.permission));
    if (children?.length) visible.push({ ...item, children });
    else if (item.permission && can(item.permission))
      visible.push({ ...item, children: undefined });
    return visible;
  }, []);
}
export const routeTitles = new Map(
  navigation
    .flatMap((item) => [item, ...(item.children ?? [])])
    .map((item) => [item.path, item.label]),
);
