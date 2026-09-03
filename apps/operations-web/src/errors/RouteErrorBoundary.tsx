import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ErrorPage } from "../pages/PageStates";
import { ErrorBoundary } from "./ErrorBoundary";
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary
      key={location.pathname}
      fallback={(_error, reset) => (
        <ErrorPage
          title="This workspace couldn’t load"
          description="The rest of the dashboard is still available."
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
