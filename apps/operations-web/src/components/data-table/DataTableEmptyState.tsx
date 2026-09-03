import { EmptyState } from "../feedback";
export function DataTableEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}
