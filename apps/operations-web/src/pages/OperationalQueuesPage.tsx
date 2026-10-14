import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiFeedback, useApiQuery } from "@sokoni-digital/api-client/react";
import { api } from "../lib/api";

type Page<T> = { data: T[]; pagination: { page: number; totalPages: number; totalItems: number } };
type Order = { id: string; reference: string; consumer: { name: string }; market: { name: string }; payment: { status: string } | null; delivery: { status: string } | null; createdAt: string };
type Refund = { id: string; orderId: string; orderReference: string; reason: string; requestedAmount: number; currency: string; status: string; approvalState: string; createdAt: string };

export function OperationalQueuesPage({ kind }: { kind: "orders" | "refunds" }) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const query = useApiQuery({
    queryKey: ["operations", kind, page, search],
    queryFn: ({ signal }) => api.get<Page<Order> | Page<Refund>>(`/v1/public/operations/${kind}?page=${page}&pageSize=25${search ? `&q=${encodeURIComponent(search)}` : ""}`, { signal }),
  });
  return <section className="placeholder-page">
    <p className="eyebrow">Sokoni operations</p><h1>{kind === "orders" ? "Orders" : "Refund requests"}</h1>
    <form onSubmit={event => { event.preventDefault(); setPage(1); setSearch(draft.trim()); }}>
      <label>Search <input value={draft} onChange={event => setDraft(event.target.value)} /></label><button type="submit">Search</button>
    </form>
    <ApiFeedback pending={query.isPending} refreshing={query.isFetching && !query.isPending} error={query.error} onRetry={() => void query.refetch()} />
    {query.data?.data.length === 0 && <p>No {kind} found.</p>}
    <ul className="delivery-timeline">{kind === "orders" ? (query.data?.data as Order[] | undefined)?.map(row =>
      <li key={row.id}><Link to={`/dashboard/orders/${row.id}`}>{row.reference}</Link> · {row.consumer.name} · {row.market.name} · {row.payment?.status ?? "No payment"} · {row.delivery?.status ?? "No delivery"}</li>) :
      (query.data?.data as Refund[] | undefined)?.map(row => <li key={row.id}><Link to={`/dashboard/orders/${row.orderId}`}>{row.orderReference}</Link> · {row.currency} {row.requestedAmount.toLocaleString()} · {row.reason.replaceAll("_", " ")} · {row.status.replaceAll("_", " ")} · approval {row.approvalState.replaceAll("_", " ")}</li>)}
    </ul>
    {query.data && <div className="actions"><button disabled={page <= 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, query.data.pagination.totalPages)}</span><button disabled={page >= query.data.pagination.totalPages || query.isFetching} onClick={() => setPage(value => value + 1)}>Next</button></div>}
  </section>;
}
