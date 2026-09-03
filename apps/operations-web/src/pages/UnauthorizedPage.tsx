import { Link, useLocation } from "react-router-dom";
export function UnauthorizedPage() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <main className="not-found forbidden-page">
      <span>403</span>
      <h1>You don’t have access to this workspace</h1>
      <p>Your staff role does not include the required permission{from ? ` for ${from}` : ""}.</p>
      <Link className="button-link" to="/dashboard/overview">
        Return to overview
      </Link>
    </main>
  );
}
