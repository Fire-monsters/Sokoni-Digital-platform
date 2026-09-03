import type { ReactNode } from "react";
export function DataTableToolbar({
  title,
  description,
  filters,
  actions,
}: {
  title?: string;
  description?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="table-toolbar">
      <div>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
      </div>
      {filters ? <div className="toolbar-filters">{filters}</div> : null}
      {actions ? <div className="toolbar-actions">{actions}</div> : null}
    </div>
  );
}
