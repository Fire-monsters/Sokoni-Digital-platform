import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ErrorState,
  KpiCard,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  EmptyState,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDemoQuery } from "@/hooks/use-demo";
import { getOverview } from "@/services/api";
import { eat, qty, ugx, label } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Sokoni Digital SME" },
      {
        name: "description",
        content: "Today's sales, purchasing, stock and orders needing action for your shop.",
      },
      { property: "og:title", content: "Overview — Sokoni Digital SME" },
      {
        property: "og:description",
        content: "Today's sales, purchasing, stock and orders needing action for your shop.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const q = useDemoQuery(["overview"], getOverview);
  if (q.isPending)
    return (
      <>
        <PageHeader title="Overview" />
        <LoadingState rows={6} />
      </>
    );
  if (q.isError)
    return (
      <>
        <PageHeader title="Overview" />
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </>
    );
  const { kpis, sales, restock, actionOrders, incoming, lowStock, profile } = q.data;

  return (
    <>
      <PageHeader
        title={`Good day, ${profile.owner.split(" ")[0]}`}
        description="Your buying and selling share one inventory. Cards open the matching filtered list."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/sell/orders">View consumer orders</Link>
            </Button>
            <Button asChild>
              <Link to="/buy/catalogue">
                <ShoppingCart className="h-4 w-4" /> Buy stock
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operating as:</span>
        {profile.cropTypes.map((c) => (
          <Badge key={c} variant="secondary">
            {c === "cash" ? "Cash crops" : "Food crops"}
          </Badge>
        ))}
        <span className="text-muted-foreground">· Focus:</span>
        {profile.categories.map((c) => (
          <Badge key={c} variant="outline" className="capitalize">
            {c}
          </Badge>
        ))}
        <Link to="/settings" className="text-primary underline-offset-2 hover:underline">
          Change
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Revenue today"
          value={ugx(kpis.revenueToday)}
          hint="Finance"
          icon={<Banknote className="h-4 w-4" />}
          to="/finance"
        />
        <KpiCard
          label="Orders today"
          value={String(kpis.ordersToday)}
          hint={`${kpis.newOrders} new`}
          icon={<ClipboardList className="h-4 w-4" />}
          to="/sell/orders"
          search={{ status: "new" }}
          tone={kpis.newOrders ? "alert" : "default"}
        />
        <KpiCard
          label="Need action"
          value={String(kpis.ordersNeedingAction)}
          hint="Open orders"
          icon={<ClipboardList className="h-4 w-4" />}
          to="/sell/orders"
          search={{ status: "open" }}
        />
        <KpiCard
          label="Pending deliveries"
          value={String(kpis.pendingDeliveries)}
          hint="Track"
          icon={<Truck className="h-4 w-4" />}
          to="/buy/orders"
          search={{ status: "open" }}
        />
        <KpiCard
          label="Stock on hand"
          value={ugx(kpis.stockValue)}
          hint="At purchase cost"
          icon={<Package className="h-4 w-4" />}
          to="/inventory"
        />
        <KpiCard
          label="Low stock"
          value={String(kpis.lowStock)}
          hint="Restock"
          icon={<AlertTriangle className="h-4 w-4" />}
          to="/inventory"
          search={{ filter: "low" }}
          tone={kpis.lowStock ? "alert" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Sales — last 14 days"
          className="lg:col-span-2"
          action={
            <span className="text-xs text-muted-foreground">
              Completed consumer orders · purchase spend 30d {ugx(kpis.purchaseSpend30d)}
            </span>
          }
        >
          <div
            className="h-64"
            role="img"
            aria-label="Bar chart of daily completed sales revenue in UGX"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  width={40}
                />
                <Tooltip formatter={(v: number) => ugx(v)} />
                <Bar dataKey="revenue" name="Revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Restocking suggestions"
          action={<Sparkles className="h-4 w-4 text-warning" aria-hidden />}
        >
          {restock.length === 0 ? (
            <EmptyState
              title="Stock levels look healthy"
              description="No restocking needed for your focus products."
            />
          ) : (
            <ul className="space-y-3">
              {restock.slice(0, 4).map((r) => (
                <li key={r.item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{r.item.name}</p>
                    <StatusBadge
                      status={r.urgency === "high" ? "low" : "pending"}
                      text={r.urgency === "high" ? "Reorder now" : "Reorder soon"}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>
                      Suggest{" "}
                      <b>
                        {r.suggestedPackages} {r.packageUnit}s
                      </b>{" "}
                      ({qty(r.suggestedPackages * r.unitsPerPackage, r.item.stockUnit)})
                    </span>
                    <Link
                      to="/buy/catalogue"
                      search={{ q: r.item.name }}
                      className="font-medium text-primary hover:underline"
                    >
                      Order
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Illustrative suggestion based on 14-day sales velocity and delivery time.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Orders requiring action"
          action={
            <Link
              to="/sell/orders"
              search={{ status: "open" }}
              className="text-sm text-primary hover:underline"
            >
              All
            </Link>
          }
        >
          {actionOrders.length === 0 ? (
            <EmptyState title="All caught up" />
          ) : (
            <ul className="divide-y">
              {actionOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{o.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.id} · {ugx(o.total)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Incoming deliveries"
          action={
            <Link
              to="/buy/orders"
              search={{ status: "open" }}
              className="text-sm text-primary hover:underline"
            >
              All
            </Link>
          }
        >
          {incoming.length === 0 ? (
            <EmptyState title="No deliveries expected" />
          ) : (
            <ul className="divide-y">
              {incoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{p.id}</p>
                    <p className="text-xs text-muted-foreground">ETA {eat(p.eta)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Low-stock alerts"
          action={<Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />}
        >
          {lowStock.length === 0 ? (
            <EmptyState title="No low stock" />
          ) : (
            <ul className="divide-y">
              {lowStock.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {label(i.category)} · threshold {qty(i.lowStockThreshold, i.stockUnit)}
                    </p>
                  </div>
                  <span className="tabular font-semibold text-destructive">
                    {qty(i.available, i.stockUnit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
