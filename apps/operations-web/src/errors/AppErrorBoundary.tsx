import type { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <main className="fatal-error" role="alert">
          <p className="eyebrow">Application error</p>
          <h1>Sokoni Operations couldn’t start</h1>
          <p>{error.message || "An unexpected error prevented the dashboard from loading."}</p>
          <button onClick={() => window.location.reload()}>Reload dashboard</button>
        </main>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
