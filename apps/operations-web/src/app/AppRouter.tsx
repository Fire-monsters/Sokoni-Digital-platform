import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { PaymentsPage } from "../pages/PaymentsPage";
import { OrderInvestigationPage } from "../pages/OrderInvestigationPage";
import { AuditLogPage } from "../pages/AuditLogPage";
import { DashboardLayout } from "../components/DashboardLayout";
import { CatalogueListingsPage, PriceChangesPage } from "../pages/CataloguePages";
import { DeliveriesPage } from "../pages/DeliveriesPage";
import { NotFoundPage, PlaceholderPage } from "../pages/PlaceholderPage";
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate replace to="/dashboard/overview" />} />
        <Route path="/login" element={<Navigate replace to="/dashboard/overview" />} />
        <Route>
          <Route path="/unauthorized" element={<Navigate replace to="/dashboard/overview" />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate replace to="overview" />} />
            <Route path="overview" element={<PlaceholderPage title="Overview" />} />
            <Route path="orders" element={<PlaceholderPage title="Orders" />} />
            <Route path="orders/:orderId" element={<OrderInvestigationPage />} />
            <Route path="deliveries" element={<DeliveriesPage />} />
            <Route path="approvals" element={<ApprovalIndex />} />
            <Route
              path="approvals/vendors"
              element={<ApplicationsPage key="vendor" type="vendor" />}
            />
            <Route
              path="approvals/riders"
              element={<ApplicationsPage key="rider" type="rider" />}
            />
            <Route path="approvals/listings" element={<CatalogueListingsPage />} />
            <Route path="approvals/price-changes" element={<PriceChangesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="refunds" element={<PlaceholderPage title="Refunds" />} />
            <Route path="settlements" element={<PlaceholderPage title="Settlements" />} />
            <Route path="users" element={<PlaceholderPage title="Users & Devices" />} />
            <Route path="notifications" element={<PlaceholderPage title="Notifications" />} />
            <Route path="reports" element={<PlaceholderPage title="Reports" />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
function ApprovalIndex() {
  return <Navigate replace to="vendors" />;
}
