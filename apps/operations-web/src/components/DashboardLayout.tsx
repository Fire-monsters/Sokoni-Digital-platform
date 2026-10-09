import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { navigation, routeTitles } from "../app/navigation";
import { Icon } from "./Icon";
import { RouteErrorBoundary } from "../errors/RouteErrorBoundary";

export function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const permittedNavigation = navigation;
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
            <strong>Demo operator</strong>
            <small>Local workspace</small>
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
            <span className="environment">Demo mode — changes reset on reload.</span>
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
