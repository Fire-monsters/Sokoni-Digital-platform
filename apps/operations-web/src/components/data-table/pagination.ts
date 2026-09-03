import type { PaginationState } from "./DataTablePagination";
export function pageCount({ pageSize, totalItems }: PaginationState) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}
