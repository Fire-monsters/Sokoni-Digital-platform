import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { label } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONE: Record<string, "success" | "warning" | "info" | "danger" | "neutral" | "accent"> = {
  submitted: "info",
  confirmed: "info",
  in_transit: "warning",
  received: "success",
  cancelled: "neutral",
  new: "accent",
  accepted: "info",
  preparing: "warning",
  ready_for_pickup: "success",
  completed: "neutral",
  rejected: "danger",
  draft: "neutral",
  pending_review: "warning",
  live: "success",
  paused: "neutral",
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  released: "success",
  low: "danger",
  ok: "success",
};

export function StatusBadge({ status, text }: { status: string; text?: string }) {
  return <Badge variant={TONE[status] ?? "neutral"}>{text ?? label(status)}</Badge>;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-danger-soft p-8 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-semibold">Couldn't load this data</p>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card p-10 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md bg-success-soft p-3 text-sm text-success"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  to,
  search,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  to: string;
  search?: Record<string, string>;
  tone?: "default" | "alert";
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary hover:shadow-md",
        tone === "alert" && "border-accent",
      )}
    >
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span
          className={cn(
            "rounded-md bg-secondary p-1.5 text-primary",
            tone === "alert" && "bg-accent text-accent-foreground",
          )}
        >
          {icon}
        </span>
      </div>
      <span className="tabular text-2xl font-bold">{value}</span>
      {hint && (
        <span className="text-xs text-muted-foreground group-hover:text-primary">{hint} →</span>
      )}
    </Link>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
