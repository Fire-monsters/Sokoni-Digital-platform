import type { ReactNode } from "react";
import { DataTableEmptyState } from "./DataTableEmptyState";
export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
};
export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  caption?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  pagination?: ReactNode;
};
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  caption,
  emptyTitle = "No results",
  emptyDescription,
  onRowClick,
  pagination,
}: DataTableProps<T>) {
  return (
    <div className="data-table-shell">
      {loading ? (
        <TableSkeleton columns={columns.length} />
      ) : data.length === 0 ? (
        <DataTableEmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="data-table-scroll">
          <table className="data-table">
            {caption ? <caption>{caption}</caption> : null}
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ textAlign: column.align, width: column.width }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? "interactive" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.id} style={{ textAlign: column.align }}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination}
    </div>
  );
}
export function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="table-skeleton" aria-label="Loading table">
      <div className="skeleton-row header">
        {Array.from({ length: columns }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      {Array.from({ length: 5 }, (_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <i key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}
