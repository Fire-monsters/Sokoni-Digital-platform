import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { RequirePermission } from "../auth/RequirePermission";
import { CatalogueListingsPage, PriceChangesPage } from "../pages/CataloguePages";
import { DeliveriesPage } from "../pages/DeliveriesPage";
import { NotFoundPage, OrderDetailPage, PlaceholderPage } from "../pages/PlaceholderPage";
import { LoginPage } from "../pages/LoginPage";
import { UnauthorizedPage } from "../pages/UnauthorizedPage";
import type { StaffPermission } from "@sokoni-digital/domain";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
const allowed = (permission: StaffPermission, content: ReactNode) => (
  <RequirePermission permission={permission}>{content}</RequirePermission>
);
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate replace to="/dashboard/overview" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate replace to="overview" />} />
            <Route
              path="overview"
              element={allowed("overview.read", <PlaceholderPage title="Overview" />)}
            />
            <Route
              path="orders"
              element={allowed("orders.read", <PlaceholderPage title="Orders" />)}
            />
            <Route path="orders/:orderId" element={allowed("orders.read", <OrderDetailPage />)} />
            <Route path="deliveries" element={allowed("deliveries.read", <DeliveriesPage />)} />
            <Route path="approvals" element={<ApprovalIndex />} />
            <Route
              path="approvals/vendors"
              element={allowed("applications.read", <PlaceholderPage title="Vendor approvals" />)}
            />
            <Route
              path="approvals/riders"
              element={allowed("applications.read", <PlaceholderPage title="Rider approvals" />)}
            />
            <Route
              path="approvals/listings"
              element={allowed("catalogue.read", <CatalogueListingsPage />)}
            />
            <Route
              path="approvals/price-changes"
              element={allowed("catalogue.read", <PriceChangesPage />)}
            />
            <Route
              path="payments"
              element={allowed("payments.read", <PlaceholderPage title="Payments" />)}
            />
            <Route
              path="refunds"
              element={allowed("refunds.read", <PlaceholderPage title="Refunds" />)}
            />
            <Route
              path="settlements"
              element={allowed("settlements.read", <PlaceholderPage title="Settlements" />)}
            />
            <Route
              path="users"
              element={allowed("users.read", <PlaceholderPage title="Users & Devices" />)}
            />
            <Route
              path="notifications"
              element={allowed("notifications.read", <PlaceholderPage title="Notifications" />)}
            />
            <Route
              path="reports"
              element={allowed("reports.read", <PlaceholderPage title="Reports" />)}
            />
            <Route
              path="audit"
              element={allowed("audit.read", <PlaceholderPage title="Audit Log" />)}
            />
            <Route
              path="settings"
              element={allowed("settings.manage", <PlaceholderPage title="Settings" />)}
            />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
function ApprovalIndex() {
  const { can } = useAuth();
  if (can("applications.read")) return <Navigate replace to="vendors" />;
  if (can("catalogue.read")) return <Navigate replace to="listings" />;
  return <Navigate replace to="/unauthorized" />;
}
