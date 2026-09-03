import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading")
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="spinner" />
        <p>Restoring your secure session…</p>
      </main>
    );
  if (state.status !== "authenticated")
    return (
      <Navigate
        replace
        state={{
          from: location.pathname + location.search,
          reason: state.status,
          message: "message" in state ? state.message : undefined,
        }}
        to="/login"
      />
    );
  return <Outlet />;
}
