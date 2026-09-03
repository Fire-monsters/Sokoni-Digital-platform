import type { StaffPermission } from "@sokoni-digital/domain";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequirePermission({
  permission,
  children,
}: {
  permission: StaffPermission;
  children: ReactNode;
}) {
  const { can } = useAuth();
  const location = useLocation();
  return can(permission) ? (
    children
  ) : (
    <Navigate replace state={{ from: location.pathname }} to="/unauthorized" />
  );
}
