import { pageCount } from "./pagination";
export type PaginationState = { page: number; pageSize: number; totalItems: number };
export function DataTablePagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationState;
  onPageChange: (page: number) => void;
}) {
  const pages = pageCount(pagination);
  const start = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
  return (
    <div className="table-pagination">
      <span>
        {start}–{end} of {pagination.totalItems}
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          ←
        </button>
        <span>
          Page {pagination.page} of {pages}
        </span>
        <button
          aria-label="Next page"
          disabled={pagination.page >= pages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          →
        </button>
      </div>
    </div>
  );
}
