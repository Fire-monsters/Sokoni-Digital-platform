import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./common";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  search,
  onRowClick,
  pageSize = 8,
  toolbar,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  search?: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  caption: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let r =
      search && q ? rows.filter((x) => search(x).toLowerCase().includes(q.toLowerCase())) : rows;
    const col = columns.find((c) => c.key === sort?.key);
    if (col?.sort && sort)
      r = [...r].sort(
        (a, b) =>
          (col.sort!(a) > col.sort!(b) ? 1 : col.sort!(a) < col.sort!(b) ? -1 : 0) * sort.dir,
      );
    return r;
  }, [rows, q, sort, columns, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="space-y-3">
      {(search || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search && (
            <div className="relative sm:w-72">
              <Search
                className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                aria-label={`Search ${caption}`}
                placeholder="Search…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                className="bg-card pl-8"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState
          title={q ? "No matches" : emptyTitle}
          description={q ? "Try a different search or clear filters." : emptyDescription}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", c.className)}
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === 1
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded hover:text-foreground"
                        onClick={() =>
                          setSort((s) =>
                            s?.key === c.key
                              ? { key: c.key, dir: (s.dir * -1) as 1 | -1 }
                              : { key: c.key, dir: 1 },
                          )
                        }
                      >
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === 1 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(r);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "border-t",
                    onRowClick && "cursor-pointer hover:bg-secondary/60 focus-visible:bg-secondary",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filtered.length} records · page {current + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
