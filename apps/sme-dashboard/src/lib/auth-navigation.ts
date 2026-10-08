import { defaultParseSearch } from "@tanstack/react-router";
import { safeReturnTo } from "@/features/auth/validation";

type DashboardPath =
  | "/"
  | "/inventory"
  | "/finance"
  | "/reports"
  | "/settings"
  | "/buy/catalogue"
  | "/buy/orders"
  | "/sell/listings"
  | "/sell/orders";

export function authDestination(value: unknown) {
  const url = new URL(safeReturnTo(value), "https://dashboard.invalid");
  return {
    to: url.pathname as DashboardPath,
    search: defaultParseSearch(url.search),
    hash: url.hash.slice(1),
  };
}
