import type { ReactNode } from "react";
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
export type Severity = "low" | "medium" | "high" | "critical";
export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone: StatusTone =
    severity === "low" ? "info" : severity === "medium" ? "warning" : "danger";
  return <StatusBadge tone={tone}>{severity}</StatusBadge>;
}
