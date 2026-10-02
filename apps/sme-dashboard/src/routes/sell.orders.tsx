import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BellPlus, Check } from "lucide-react";
import { ErrorState, LoadingState, PageHeader, StatusBadge, Spinner } from "@/components/common";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import {
  acceptOrder,
  completeOrder,
  getSalesOrders,
  markReady,
  rejectOrder,
  setChecklist,
  simulateIncomingOrder,
  startPreparing,
} from "@/services/api";
import { eat, label, qty, ugx } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalesOrder } from "@/models/types";

export const Route = createFileRoute("/sell/orders")({
  validateSearch: (s: Record<string, unknown>): { status?: string } => ({
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Consumer orders — Sokoni Digital SME" },
      {
        name: "description",
        content: "Accept, prepare and hand over consumer orders with stock reservations.",
      },
      { property: "og:title", content: "Consumer orders — Sokoni Digital SME" },
      { property: "og:description", content: "Accept, prepare and hand over consumer orders." },
    ],
  }),
  component: Orders,
});

type O = Awaited<ReturnType<typeof getSalesOrders>>[number];
const OPEN = ["new", "accepted", "preparing", "ready_for_pickup"];
const FLOW = ["new", "accepted", "preparing", "ready_for_pickup", "completed"] as const;

function Orders() {
  const { status = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useDemoQuery(["sales"], getSalesOrders);
  const [sel, setSel] = useState<string | null>(null);
  const sim = useDemoMutation(
    () => simulateIncomingOrder(),
    (o) => `New order ${o.id} from ${o.customerName}`,
  );
  const rows = (q.data ?? []).filter(
    (o) => status === "all" || (status === "open" ? OPEN.includes(o.status) : o.status === status),
  );
  const count = (s: string) =>
    (q.data ?? []).filter((o) =>
      s === "open" ? OPEN.includes(o.status) : s === "all" || o.status === s,
    ).length;

  return (
    <>
      <PageHeader
        title="Consumer orders"
        description="Sales orders from shoppers. Accepting reserves stock so you never oversell."
        actions={
          <Button variant="outline" disabled={sim.isPending} onClick={() => sim.mutate(undefined)}>
            <BellPlus className="h-4 w-4" /> Simulate incoming order
          </Button>
        }
      />
      <Tabs
        value={status}
        onValueChange={(v) => navigate({ search: { status: v } })}
        className="mb-3"
      >
        <TabsList className="flex h-auto flex-wrap">
          {["all", "open", ...FLOW, "rejected"].map((s) => (
            <TabsTrigger key={s} value={s}>
              {label(s)} <span className="ml-1 text-xs opacity-70">{q.data ? count(s) : ""}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          caption="Consumer orders"
          rows={rows}
          onRowClick={(r) => setSel(r.id)}
          search={(r) => `${r.id} ${r.customerName} ${r.lines.map((l) => l.title).join(" ")}`}
          emptyTitle="No orders in this view"
          emptyDescription='Use "Simulate incoming order" to create one.'
          columns={[
            {
              key: "id",
              header: "Order",
              cell: (r) => <span className="font-medium">{r.id}</span>,
              sort: (r) => r.id,
            },
            {
              key: "cust",
              header: "Customer",
              cell: (r) => r.customerName,
              sort: (r) => r.customerName,
            },
            {
              key: "items",
              header: "Items",
              cell: (r) =>
                r.lines.map((l) => `${l.title} × ${qty(l.quantity, l.stockUnit)}`).join(", "),
            },
            {
              key: "total",
              header: "Total",
              cell: (r) => <span className="tabular">{ugx(r.total)}</span>,
              sort: (r) => r.total,
              className: "text-right",
            },
            {
              key: "time",
              header: "Ordered",
              cell: (r) => eat(r.createdAt),
              sort: (r) => r.createdAt,
              className: "whitespace-nowrap",
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => <StatusBadge status={r.status} />,
              sort: (r) => FLOW.indexOf(r.status as never),
            },
          ]}
        />
      )}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {q.data?.find((o) => o.id === sel) && (
            <OrderDetail order={q.data.find((o) => o.id === sel)!} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function OrderDetail({ order: o }: { order: O }) {
  const accept = useDemoMutation(acceptOrder, "Order accepted — stock reserved");
  const prep = useDemoMutation(startPreparing, "Preparation started");
  const check = useDemoMutation(setChecklist);
  const ready = useDemoMutation(markReady, "Customer notified: ready for pickup");
  const complete = useDemoMutation(
    completeOrder,
    "Order completed — stock deducted, payment released",
  );
  const [rejecting, setRejecting] = useState(false);
  const shortage =
    o.status === "new" && o.lines.some((l, i) => (o.stock[i]?.available ?? 0) < l.quantity);
  const step = FLOW.indexOf(o.status as (typeof FLOW)[number]);
  const checklistDone = Object.values(o.checklist).every(Boolean);

  return (
    <div className="space-y-5 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle>
          {o.id} · {o.customerName}
        </SheetTitle>
        <SheetDescription>
          {o.customerPhone} · ordered {eat(o.createdAt)}
        </SheetDescription>
      </SheetHeader>
      {o.status === "rejected" ? (
        <p className="rounded bg-danger-soft p-3 text-sm text-destructive">
          Rejected: {o.rejectReason}
        </p>
      ) : (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px]" aria-label="Order progress">
          {FLOW.map((s, i) => (
            <li
              key={s}
              className="flex flex-col items-center gap-1"
              aria-current={i === step ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full border text-xs",
                  i < step && "border-primary bg-primary text-primary-foreground",
                  i === step && "border-accent bg-accent font-bold text-accent-foreground",
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={i === step ? "font-semibold" : "text-muted-foreground"}>
                {label(s)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Order items</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1">Item</th>
            <th>Qty</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l, i) => (
            <tr key={l.listingId} className="border-t">
              <td className="py-2">
                {l.title}
                {o.status === "new" && (
                  <>
                    <br />
                    <span
                      className={cn(
                        "text-xs",
                        (o.stock[i]?.available ?? 0) < l.quantity
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {qty(o.stock[i]?.available ?? 0, l.stockUnit)} available
                    </span>
                  </>
                )}
              </td>
              <td>{qty(l.quantity, l.stockUnit)}</td>
              <td className="tabular text-right">{ugx(l.quantity * l.unitPrice)}</td>
            </tr>
          ))}
          <tr className="border-t font-bold">
            <td colSpan={2} className="py-2">
              Total
            </td>
            <td className="tabular text-right">{ugx(o.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">{o.pickupNote}</p>

      {o.status === "new" && (
        <div className="space-y-2">
          {shortage && (
            <p role="alert" className="rounded bg-danger-soft p-2 text-sm text-destructive">
              Not enough available stock to accept. Restock first or reject the order.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={shortage || accept.isPending}
              onClick={() => accept.mutate(o.id)}
            >
              {accept.isPending && <Spinner />} Accept & reserve stock
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        </div>
      )}
      {o.status === "accepted" && (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={prep.isPending} onClick={() => prep.mutate(o.id)}>
            Start preparing
          </Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
      {o.status === "preparing" && (
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">Quality checklist</legend>
          {(
            [
              ["qualityChecked", "Produce inspected — no spoilage"],
              ["weighed", "Quantities weighed / counted"],
              ["packed", "Packed and labelled with order ID"],
            ] as const
          ).map(([k, l]) => (
            <div key={k} className="flex items-center gap-2">
              <Checkbox
                id={k}
                checked={o.checklist[k]}
                disabled={check.isPending}
                onCheckedChange={(v) => check.mutate({ id: o.id, key: k, value: v === true })}
              />
              <Label htmlFor={k} className="font-normal">
                {l}
              </Label>
            </div>
          ))}
          <Button
            className="mt-2 w-full"
            disabled={!checklistDone || ready.isPending}
            onClick={() => ready.mutate(o.id)}
          >
            Mark ready for pickup
          </Button>
          {!checklistDone && (
            <p className="text-xs text-muted-foreground">Tick all checks to enable this action.</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>
            Reject order
          </Button>
        </fieldset>
      )}
      {o.status === "ready_for_pickup" && (
        <div className="space-y-2">
          <p className="rounded bg-success-soft p-2 text-sm text-success">
            Waiting for {o.customerName} to collect.
          </p>
          <Button
            className="w-full"
            disabled={complete.isPending}
            onClick={() => complete.mutate(o.id)}
          >
            Simulate: customer collected
          </Button>
        </div>
      )}
      {o.status === "completed" && (
        <p className="rounded bg-muted p-2 text-sm">
          Completed. Payment released from escrow to your wallet.
        </p>
      )}

      <div>
        <h3 className="mb-1 text-sm font-semibold">History</h3>
        <ul className="text-sm text-muted-foreground">
          {o.history.map((h, i) => (
            <li key={i}>
              {label(h.status)} · {eat(h.at)}
            </li>
          ))}
        </ul>
      </div>
      {rejecting && <RejectDialog order={o} onClose={() => setRejecting(false)} />}
    </div>
  );
}

function RejectDialog({ order, onClose }: { order: SalesOrder; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const rej = useDemoMutation(rejectOrder, "Order rejected — customer notified");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {order.id}?</DialogTitle>
          <DialogDescription>
            {order.status !== "new"
              ? "Reserved stock will be released back to available."
              : "The customer will be notified."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (reason.trim()) rej.mutate({ id: order.id, reason }, { onSuccess: onClose });
          }}
          className="space-y-2"
        >
          <Label htmlFor="rr">Reason shown to customer</Label>
          <Textarea
            id="rr"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={touched && !reason.trim()}
            placeholder="e.g. Item out of stock today"
            autoFocus
          />
          {touched && !reason.trim() && (
            <p className="text-xs text-destructive">A reason is required.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep order
            </Button>
            <Button type="submit" variant="destructive" disabled={rej.isPending}>
              Reject order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
