import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PackageCheck, ShoppingCart } from "lucide-react";
import { ErrorState, LoadingState, PageHeader, StatusBadge, Spinner } from "@/components/common";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import {
  advancePurchaseOrder,
  cancelPurchaseOrder,
  getProfile,
  getPurchaseOrders,
  receivePurchaseOrder,
} from "@/services/api";
import { downloadInvoice } from "@/lib/download";
import { eat, label, paymentLabel, qty, ugx } from "@/lib/format";
import type { PurchaseOrder } from "@/models/types";

export const Route = createFileRoute("/buy/orders")({
  validateSearch: (s: Record<string, unknown>): { status?: string } => ({
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Purchase orders — Sokoni Digital SME" },
      {
        name: "description",
        content: "Track wholesale purchase orders and receive stock into inventory.",
      },
      { property: "og:title", content: "Purchase orders — Sokoni Digital SME" },
      {
        property: "og:description",
        content: "Track wholesale purchase orders and receive stock into inventory.",
      },
    ],
  }),
  component: PurchaseOrders,
});

const OPEN = ["submitted", "confirmed", "in_transit"];

function PurchaseOrders() {
  const { status = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useDemoQuery(["pos"], getPurchaseOrders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = (q.data ?? []).filter(
    (p) => status === "all" || (status === "open" ? OPEN.includes(p.status) : p.status === status),
  );
  const selected = q.data?.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Orders you place with the Agro-Warehouse. Separate from consumer sales orders."
        actions={
          <Button asChild>
            <Link to="/buy/catalogue">
              <ShoppingCart className="h-4 w-4" /> New purchase
            </Link>
          </Button>
        }
      />
      <Tabs
        value={status}
        onValueChange={(v) => navigate({ search: { status: v } })}
        className="mb-3"
      >
        <TabsList className="flex h-auto flex-wrap">
          {["all", "open", "submitted", "confirmed", "in_transit", "received", "cancelled"].map(
            (s) => (
              <TabsTrigger key={s} value={s}>
                {label(s)}
              </TabsTrigger>
            ),
          )}
        </TabsList>
      </Tabs>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          caption="Purchase orders"
          rows={rows}
          onRowClick={(r) => setSelectedId(r.id)}
          search={(r) => `${r.id} ${r.lines.map((l) => l.name).join(" ")}`}
          emptyTitle="No purchase orders in this view"
          emptyDescription="Browse the wholesale catalogue to place an order."
          columns={[
            {
              key: "id",
              header: "Order",
              cell: (r) => <span className="font-medium">{r.id}</span>,
              sort: (r) => r.id,
            },
            {
              key: "date",
              header: "Placed",
              cell: (r) => eat(r.createdAt),
              sort: (r) => r.createdAt,
              className: "whitespace-nowrap",
            },
            {
              key: "items",
              header: "Items",
              cell: (r) =>
                r.lines.map((l) => `${l.name} (${l.quantity} ${l.packageUnit}s)`).join(", "),
            },
            {
              key: "total",
              header: "Total",
              cell: (r) => <span className="tabular">{ugx(r.total)}</span>,
              sort: (r) => r.total,
              className: "text-right",
            },
            {
              key: "eta",
              header: "ETA",
              cell: (r) =>
                r.status === "received" ? "Delivered" : r.status === "cancelled" ? "—" : eat(r.eta),
              sort: (r) => r.eta,
              className: "whitespace-nowrap",
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => <StatusBadge status={r.status} />,
              sort: (r) => r.status,
            },
          ]}
        />
      )}
      <PODrawer po={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}

function PODrawer({ po, onClose }: { po: PurchaseOrder | null; onClose: () => void }) {
  const profile = useDemoQuery(["profile"], getProfile);
  const advance = useDemoMutation(advancePurchaseOrder, "Order status updated");
  const cancel = useDemoMutation(cancelPurchaseOrder, "Purchase order cancelled");
  const receive = useDemoMutation(receivePurchaseOrder, "Stock received into inventory");
  return (
    <Sheet open={!!po} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {po && (
          <div className="space-y-5 px-4 pb-6">
            <SheetHeader className="px-0">
              <SheetTitle>{po.id}</SheetTitle>
              <SheetDescription>
                Placed {eat(po.createdAt)} · {paymentLabel[po.paymentMethod]}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={po.status} />
              <StatusBadge status={po.paymentStatus} text={`Payment ${po.paymentStatus}`} />
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">Order lines</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Item</th>
                  <th>Qty</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.productId} className="border-t">
                    <td className="py-2">
                      {l.name}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {ugx(l.unitPrice)} / {l.packageUnit}
                      </span>
                    </td>
                    <td>
                      {l.quantity} {l.packageUnit}s<br />
                      <span className="text-xs text-muted-foreground">
                        = {qty(l.quantity * l.unitsPerPackage, l.stockUnit)}
                      </span>
                    </td>
                    <td className="tabular text-right">{ugx(l.quantity * l.unitPrice)}</td>
                  </tr>
                ))}
                <tr className="border-t">
                  <td colSpan={2} className="py-2">
                    Delivery
                  </td>
                  <td className="tabular text-right">{ugx(po.deliveryFee)}</td>
                </tr>
                <tr className="border-t font-bold">
                  <td colSpan={2} className="py-2">
                    Total
                  </td>
                  <td className="tabular text-right">{ugx(po.total)}</td>
                </tr>
              </tbody>
            </table>
            {po.notes && (
              <p className="text-sm">
                <span className="text-muted-foreground">Notes:</span> {po.notes}
              </p>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Tracking</h3>
              <ol className="space-y-1.5 border-l-2 border-primary pl-4 text-sm">
                {po.history.map((h, i) => (
                  <li key={i}>
                    <b>{label(h.status)}</b>{" "}
                    <span className="text-muted-foreground">· {eat(h.at)}</span>
                  </li>
                ))}
                {!["received", "cancelled"].includes(po.status) && (
                  <li className="text-muted-foreground">Expected by {eat(po.eta)}</li>
                )}
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              {po.status === "submitted" && (
                <Button
                  variant="secondary"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate(po.id)}
                >
                  Simulate: warehouse confirms
                </Button>
              )}
              {po.status === "confirmed" && (
                <Button
                  variant="secondary"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate(po.id)}
                >
                  Simulate: warehouse dispatches
                </Button>
              )}
              {po.status === "in_transit" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={receive.isPending}>
                      {receive.isPending ? <Spinner /> : <PackageCheck className="h-4 w-4" />}{" "}
                      Receive stock
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm goods received?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This adds{" "}
                        {po.lines
                          .map(
                            (l) => qty(l.quantity * l.unitsPerPackage, l.stockUnit) + " " + l.name,
                          )
                          .join(", ")}{" "}
                        to inventory. It can only be done once.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => receive.mutate(po.id)}>
                        Confirm receipt
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {po.status !== "in_transit" &&
                po.status !== "received" &&
                po.status !== "cancelled" && (
                  <p className="text-xs text-muted-foreground">
                    Receive stock becomes available once the order is in transit.
                  </p>
                )}
              {po.status === "received" && (
                <Button disabled>Stock received {po.receivedAt ? eat(po.receivedAt) : ""}</Button>
              )}
              {po.status === "submitted" && (
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(po.id)}
                >
                  Cancel order
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => downloadInvoice(po, profile.data?.name ?? "")}
              >
                Download invoice
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
