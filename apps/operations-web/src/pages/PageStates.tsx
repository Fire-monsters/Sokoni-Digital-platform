import { ErrorState, ForbiddenState, LoadingState } from "../components/feedback";
export function LoadingPage({ title = "Loading workspace…" }: { title?: string }) {
  return (
    <section className="page-state">
      <LoadingState
        title={title}
        description="Please wait while the latest operational data is loaded."
      />
    </section>
  );
}
export function ErrorPage({
  title = "Unable to load this workspace",
  description = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <section className="page-state">
      <ErrorState
        title={title}
        description={description}
        action={<button onClick={onRetry}>Try again</button>}
      />
    </section>
  );
}
export function ForbiddenPage() {
  return (
    <section className="page-state">
      <ForbiddenState />
    </section>
  );
}
