import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/common";
import {
  cancelOrder,
  invoicePdfUrl,
  orders,
  type WholesaleOrder,
} from "@/services/wholesale-client";
import { eat, ugx } from "@/lib/format";

export const Route = createFileRoute("/buy/orders")({
  validateSearch: (s: Record<string, unknown>): { status?: string } => ({
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  component: PurchaseOrders,
});

function PurchaseOrders() {
  const { status = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const cancelOperation = useRef<string | null>(null);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["wholesale", "orders"],
    queryFn: orders,
    retry: false,
    enabled: import.meta.env.VITE_WHOLESALE_ENABLED === "true",
  });
  const list = query.data ?? [];
  const filtered = list.filter((order) => status === "all" || order.status === status);
  const selected = list.find((order) => order.id === selectedId) ?? null;
  const cancel = useMutation({
    mutationFn: (id: string) => {
      cancelOperation.current ??= crypto.randomUUID();
      return cancelOrder(id, cancelOperation.current);
    },
    onSuccess: () => {
      cancelOperation.current = null;
      void qc.invalidateQueries({ queryKey: ["wholesale", "orders"] });
    },
  });
  async function download(order: WholesaleOrder) {
    if (!order.invoice) return;
    setDownloadError("");
    try {
      window.location.assign(await invoicePdfUrl(order.invoice.id));
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Invoice unavailable.");
    }
  }
  if (import.meta.env.VITE_WHOLESALE_ENABLED !== "true") {
    return <ErrorState error={new Error("Live purchase orders will appear here after rollout.")} />;
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase orders"
        description="Orders submitted to an Agro-Warehouse. Confirmation and payments are recorded by authorized staff."
        actions={
          <Button asChild>
            <Link to="/buy/catalogue" search={{ q: undefined }}>
              New purchase
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {["all", "submitted", "confirmed", "declined", "cancelled"].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "default" : "outline"}
            onClick={() => navigate({ search: { status: value } })}
          >
            {value}
          </Button>
        ))}
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          No orders in this view.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Placed</th>
                <th className="p-3">Items</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => setSelectedId(order.id)}
                >
                  <td className="p-3 font-medium">{order.reference}</td>
                  <td className="p-3">{eat(order.createdAt)}</td>
                  <td className="p-3">{order.lines.map((line) => line.name).join(", ")}</td>
                  <td className="p-3">{ugx(order.totalUgx)}</td>
                  <td className="p-3">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section className="rounded-xl border bg-card p-5" aria-label="Order details">
          <div className="flex justify-between gap-4">
            <h2 className="text-lg font-semibold">{selected.reference}</h2>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </div>
          <p className="mt-1 text-sm">
            Status: {selected.status} · {eat(selected.createdAt)}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {selected.lines.map((line) => (
              <li key={line.id}>
                {line.name} · Grade {line.grade} · {line.quantityPackages} {line.packageUnit}(s) ×{" "}
                {ugx(line.unitPriceUgx)} = {ugx(line.lineTotalUgx)}
              </li>
            ))}
          </ul>
          <p className="mt-3 font-bold">Total: {ugx(selected.totalUgx)}</p>
          {selected.notes && <p className="mt-2 text-sm">Notes: {selected.notes}</p>}
          {selected.invoice ? (
            <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">Invoice {selected.invoice.reference}</p>
              <p>
                Paid: {ugx(selected.invoice.paidUgx)} · Balance: {ugx(selected.invoice.balanceUgx)}
              </p>
              <Button className="mt-2" variant="outline" onClick={() => void download(selected)}>
                Download PDF
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Invoice available after warehouse confirmation.
            </p>
          )}
          {selected.status === "submitted" && (
            <Button
              className="mt-4"
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(selected.id)}
            >
              Cancel order
            </Button>
          )}
          {cancel.isError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {cancel.error instanceof Error ? cancel.error.message : "Could not cancel order."}
            </p>
          )}
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {downloadError}
            </p>
          )}
          <ol className="mt-5 border-l pl-4 text-xs text-muted-foreground">
            {selected.history.map((event, index) => (
              <li key={index} className="mb-2">
                {event.status} · {eat(event.at)}
                {event.reason ? ` · ${event.reason}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
