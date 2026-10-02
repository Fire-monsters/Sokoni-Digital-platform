import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { ErrorState, LoadingState, PageHeader, StatusBadge, Spinner } from "@/components/common";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import { adjustStock, getInventory, getMovements, setThreshold } from "@/services/api";
import { eat, label, qty, ugx } from "@/lib/format";
import { STORAGE_LOCATIONS } from "@/models/types";

export const Route = createFileRoute("/inventory")({
  validateSearch: (s: Record<string, unknown>): { filter?: string; location?: string } => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    location: typeof s.location === "string" ? s.location : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Inventory — Sokoni Digital SME" },
      {
        name: "description",
        content: "Shared stock for buying and selling: on hand, reserved, available and movements.",
      },
      { property: "og:title", content: "Inventory — Sokoni Digital SME" },
      {
        property: "og:description",
        content: "Shared stock for buying and selling with movement history.",
      },
    ],
  }),
  component: Inventory,
});

type Row = Awaited<ReturnType<typeof getInventory>>[number];

function Inventory() {
  const { filter = "all", location = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useDemoQuery(["inventory"], getInventory);
  const [sel, setSel] = useState<string | null>(null);
  const rows = (q.data ?? []).filter(
    (r) => (filter !== "low" || r.low) && (location === "all" || r.location === location),
  );
  const selected = q.data?.find((r) => r.id === sel) ?? null;
  return (
    <>
      <PageHeader
        title="Inventory"
        description="One warehouse with multiple storage locations. Purchases add stock, accepted consumer orders reserve it, collected orders deduct it."
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, filter: v }) })}
        >
          <TabsList>
            <TabsTrigger value="all">All products</TabsTrigger>
            <TabsTrigger value="low">Low stock</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm">
          Storage location
          <select
            value={location}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, location: e.target.value }) })
            }
            className="h-9 rounded-md border border-input bg-background px-3"
          >
            <option value="all">All locations</option>
            {STORAGE_LOCATIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          caption="Inventory"
          rows={rows}
          onRowClick={(r) => setSel(r.id)}
          search={(r) => `${r.name} ${r.category} ${r.location}`}
          emptyTitle={filter === "low" ? "No low-stock products" : "No stock yet"}
          emptyDescription="Receive a purchase order to add stock."
          columns={[
            {
              key: "name",
              header: "Product",
              cell: (r) => (
                <>
                  <span className="font-medium">{r.name}</span>
                  <br />
                  <span className="text-xs capitalize text-muted-foreground">
                    {r.category} · {r.cropType} crop
                  </span>
                </>
              ),
              sort: (r) => r.name,
            },
            {
              key: "location",
              header: "Storage location",
              cell: (r) => r.location,
              sort: (r) => r.location,
            },
            {
              key: "onHand",
              header: "On hand",
              cell: (r) => <span className="tabular">{qty(r.onHand, r.stockUnit)}</span>,
              sort: (r) => r.onHand,
              className: "text-right",
            },
            {
              key: "reserved",
              header: "Reserved",
              cell: (r) => <span className="tabular">{qty(r.reserved, r.stockUnit)}</span>,
              sort: (r) => r.reserved,
              className: "text-right",
            },
            {
              key: "available",
              header: "Available",
              cell: (r) => (
                <span className="tabular font-semibold">{qty(r.available, r.stockUnit)}</span>
              ),
              sort: (r) => r.available,
              className: "text-right",
            },
            {
              key: "thr",
              header: "Low at",
              cell: (r) => <span className="tabular">{qty(r.lowStockThreshold, r.stockUnit)}</span>,
              className: "text-right",
            },
            {
              key: "cost",
              header: "Avg cost",
              cell: (r) => (
                <span className="tabular">
                  {ugx(r.avgUnitCost)}/{r.stockUnit}
                </span>
              ),
              sort: (r) => r.avgUnitCost,
              className: "text-right whitespace-nowrap",
            },
            {
              key: "status",
              header: "Status",
              cell: (r) => (
                <StatusBadge
                  status={r.low ? "low" : "ok"}
                  text={r.low ? "Low stock" : "In stock"}
                />
              ),
              sort: (r) => Number(r.low),
            },
          ]}
        />
      )}
      <ItemDrawer item={selected} onClose={() => setSel(null)} />
    </>
  );
}

function ItemDrawer({ item, onClose }: { item: Row | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {item && <ItemDetail key={item.id} item={item} />}
      </SheetContent>
    </Sheet>
  );
}

function ItemDetail({ item }: { item: Row }) {
  const moves = useDemoQuery(["movements", item.id], () => getMovements(item.id));
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [thr, setThr] = useState(String(item.lowStockThreshold));
  const [touched, setTouched] = useState(false);
  const adj = useDemoMutation(adjustStock, "Stock adjusted");
  const th = useDemoMutation(setThreshold, "Low-stock threshold saved");
  const d = Number(delta);
  const deltaErr =
    !delta || d === 0 || !Number.isFinite(d)
      ? "Enter a positive or negative quantity"
      : item.onHand + d < item.reserved
        ? `Can't go below ${qty(item.reserved, item.stockUnit)} reserved`
        : "";
  const reasonErr = !reason.trim() ? "Reason is required" : "";

  return (
    <div className="space-y-5 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription className="capitalize">
          {item.category} · {item.location} · stock tracked in {item.stockUnit}
        </SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["On hand", item.onHand],
          ["Reserved", item.reserved],
          ["Available", item.available],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg bg-muted p-2">
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="tabular font-bold">{qty(v as number, item.stockUnit)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Value at cost: <b className="text-foreground">{ugx(item.value)}</b> · sells ~
        {item.velocity.toFixed(1)} {item.stockUnit}/day
      </p>

      <div className="rounded-lg border border-accent bg-warning-soft p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="h-4 w-4" aria-hidden /> Suggested retail price:{" "}
          {ugx(item.pricing.suggested)}/{item.stockUnit}
        </p>
        <p className="mt-1 text-xs">{item.pricing.rationale} Illustrative only.</p>
      </div>

      <form
        className="space-y-2 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!deltaErr && !reasonErr)
            adj.mutate(
              { itemId: item.id, delta: d, reason },
              {
                onSuccess: () => {
                  setDelta("");
                  setReason("");
                  setTouched(false);
                },
              },
            );
        }}
      >
        <h3 className="text-sm font-semibold">Adjust quantity</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="delta">Change ({item.stockUnit}, use − to remove)</Label>
            <Input
              id="delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              aria-invalid={touched && !!deltaErr}
            />
            {touched && deltaErr && <p className="text-xs text-destructive">{deltaErr}</p>}
          </div>
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Stock count, spoilage"
              aria-invalid={touched && !!reasonErr}
            />
            {touched && reasonErr && <p className="text-xs text-destructive">{reasonErr}</p>}
          </div>
        </div>
        <Button type="submit" size="sm" disabled={adj.isPending}>
          {adj.isPending && <Spinner />} Save adjustment
        </Button>
      </form>

      <form
        className="flex items-end gap-2 rounded-lg border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          th.mutate({ itemId: item.id, threshold: Number(thr) });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="thr">Low-stock threshold ({item.stockUnit})</Label>
          <Input
            id="thr"
            type="number"
            min={0}
            value={thr}
            onChange={(e) => setThr(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={th.isPending || thr === "" || Number(thr) < 0}
        >
          Save
        </Button>
      </form>

      <Button asChild variant="secondary" className="w-full">
        <Link to="/buy/catalogue" search={{ q: item.name }}>
          Reorder from warehouse
        </Link>
      </Button>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Stock movements</h3>
        {moves.isPending ? (
          <LoadingState rows={3} />
        ) : moves.isError ? (
          <ErrorState error={moves.error} />
        ) : moves.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {moves.data.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">
                    {label(m.type)}
                    {m.ref ? ` · ${m.ref}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.reason} · {eat(m.at)}
                  </p>
                </div>
                <span
                  className={`tabular font-semibold ${m.quantity < 0 ? "text-destructive" : "text-success"}`}
                >
                  {m.quantity > 0 ? "+" : ""}
                  {qty(m.quantity, item.stockUnit)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          "Reserved" and "released" change reserved stock, not stock on hand.
        </p>
      </div>
    </div>
  );
}
