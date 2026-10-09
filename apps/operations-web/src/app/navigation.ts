export type NavigationItem = {
  label: string;
  path: string;
  icon: string;
  children?: NavigationItem[];
};
export const navigation: NavigationItem[] = [
  { label: "Overview", path: "/dashboard/overview", icon: "grid" },
  { label: "Orders", path: "/dashboard/orders", icon: "receipt" },
  {
    label: "Deliveries",
    path: "/dashboard/deliveries",
    icon: "truck",
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
      },
      {
        label: "Riders",
        path: "/dashboard/approvals/riders",
        icon: "bike",
      },
      {
        label: "Listings",
        path: "/dashboard/approvals/listings",
        icon: "box",
      },
      {
        label: "Price changes",
        path: "/dashboard/approvals/price-changes",
        icon: "tag",
      },
    ],
  },
  { label: "Payments", path: "/dashboard/payments", icon: "card" },
  { label: "Refunds", path: "/dashboard/refunds", icon: "refund" },
  {
    label: "Settlements",
    path: "/dashboard/settlements",
    icon: "wallet",
  },
  { label: "Users & Devices", path: "/dashboard/users", icon: "users" },
  {
    label: "Notifications",
    path: "/dashboard/notifications",
    icon: "bell",
  },
  { label: "Reports", path: "/dashboard/reports", icon: "chart" },
  { label: "Audit Log", path: "/dashboard/audit", icon: "shield" },
  {
    label: "Settings",
    path: "/dashboard/settings",
    icon: "settings",
  },
];
export const routeTitles = new Map(
  navigation
    .flatMap((item) => [item, ...(item.children ?? [])])
    .map((item) => [item.path, item.label]),
);
