import type { ReactNode } from "react";

type FeedbackProps = { title: string; description?: string; action?: ReactNode };

function FeedbackState({ kind, title, description, action }: FeedbackProps & { kind: string }) {
  return (
    <div className={`feedback-state ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="feedback-icon" aria-hidden="true" />{" "}
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div className="feedback-action">{action}</div> : null}
      </div>
    </div>
  );
}
export function LoadingState({ title = "Loading…", description }: Partial<FeedbackProps>) {
  return <FeedbackState kind="loading" title={title} description={description} />;
}
export function EmptyState(props: FeedbackProps) {
  return <FeedbackState kind="empty" {...props} />;
}
export function ErrorState(props: FeedbackProps) {
  return <FeedbackState kind="error" {...props} />;
}
export function ForbiddenState({
  title = "You don’t have access",
  description = "Your staff role does not include the required permission.",
  action,
}: Partial<FeedbackProps>) {
  return <FeedbackState kind="forbidden" title={title} description={description} action={action} />;
}
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  );
}
export function RetryPanel({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <ErrorState
      title={title}
      description={description}
      action={<button onClick={onRetry}>Try again</button>}
    />
  );
}
export function EmptyResults({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      title="No matching results"
      description="Try changing or clearing the current filters."
      action={onClear ? <button onClick={onClear}>Clear filters</button> : undefined}
    />
  );
}
