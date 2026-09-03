import { useState } from "react";
import type { StaffRole } from "@sokoni-digital/domain";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navigation, routeTitles, visibleNavigation } from "../app/navigation";
import { useOperations } from "../operations/OperationsContext";
import { Icon } from "./Icon";
import { useAuth } from "../auth/AuthContext";
import { RouteErrorBoundary } from "../errors/RouteErrorBoundary";
export function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const operations = useOperations();
  const { state, signOut, can } = useAuth();
  const staff = state.status === "authenticated" ? state.staff : null;
  const permittedNavigation = visibleNavigation(navigation, can);
  const title =
    routeTitles.get(location.pathname) ??
    (location.pathname.includes("/orders/") ? "Order details" : "Dashboard");
  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            <strong>Sokoni</strong>
            <small>Operations</small>
          </span>
        </div>
        <nav>
          {permittedNavigation.map((item) => (
            <div className="nav-group" key={item.path}>
              <NavLink className="nav-link" onClick={() => setOpen(false)} to={item.path}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.children ? <span className="chevron">⌄</span> : null}
              </NavLink>
              {item.children ? (
                <div className="subnav">
                  {item.children.map((child) => (
                    <NavLink
                      className="nav-link"
                      key={child.path}
                      onClick={() => setOpen(false)}
                      to={child.path}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">SO</span>
          <span>
            <strong>{staff?.displayName ?? "Staff member"}</strong>
            <small>{staff ? roleLabel(staff.role) : "Operations staff"}</small>
          </span>
        </div>
      </aside>
      {open ? (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="dashboard-main">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
          <div className="page-heading">
            <span>Dashboard /</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment">Pilot</span>
            <span className={`api-status ${operations.connected ? "online" : ""}`}>
              <i />
              {operations.connected ? "API connected" : "API not connected"}
            </span>
            <details className="session-menu">
              <summary>
                <span className="avatar">SO</span>
                <span className="staff-copy">
                  <strong>{staff?.displayName ?? "Staff member"}</strong>
                  <small>{staff ? roleLabel(staff.role) : "Operations staff"}</small>
                </span>
              </summary>
              <div className="session-popover">
                <strong>{staff?.displayName}</strong>
                <small>{staff?.email}</small>
                <p className="session-role">{staff?.role}</p>
                <button className="logout-button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </header>
        <main className="page-content">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function roleLabel(role: StaffRole): string {
  return {
    admin: "Administrator",
    agent: "Operations agent",
    dispatcher: "Dispatcher",
    finance: "Finance",
    viewer: "Viewer",
  }[role];
}
