import type { ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuthLifecycle } from "@/hooks/use-auth";
import { safeReturnTo } from "@/features/auth/validation";
import { authDestination } from "@/lib/auth-navigation";
import { AppShell } from "@/components/AppShell";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { businessAuth } from "@/services/business-auth";

const publicPaths = new Set(["/auth/login", "/auth/register", "/auth/verify"]);
export function AuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuthLifecycle();
  const location = useLocation();
  const publicRoute = publicPaths.has(location.pathname);
  if (auth.status === "loading")
    return (
      <div className="grid min-h-screen place-items-center">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Opening your workspace…
        </p>
      </div>
    );
  if (auth.status === "error")
    return (
      <AuthLayout title="Let's reconnect" description={auth.message}>
        <Button
          className="w-full"
          onClick={() => {
            void businessAuth.refresh();
          }}
        >
          Try again
        </Button>
      </AuthLayout>
    );
  if (auth.status === "anonymous") {
    return publicRoute ? (
      children
    ) : (
      <Navigate to="/auth/login" search={{ redirect: safeReturnTo(location.href) }} replace />
    );
  }
  if (publicRoute) return <Navigate {...authDestination(location.search.redirect)} replace />;
  return <AppShell>{children}</AppShell>;
}
