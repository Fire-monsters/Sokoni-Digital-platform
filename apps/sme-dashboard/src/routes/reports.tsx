import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { ErrorState, LoadingState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { downloadCsv } from "@/lib/download";
import { qty, ugx } from "@/lib/format";
import { useDemoQuery } from "@/hooks/use-demo";
import { getReports } from "@/services/api";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Sokoni Digital SME" },
      { name: "description", content: "Reports for your Sokoni Digital SME workspace." },
      { property: "og:title", content: "Reports — Sokoni Digital SME" },
      { property: "og:description", content: "Reports for your Sokoni Digital SME workspace." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState("all");
  const q = useDemoQuery(["reports"], getReports);
  const sales = useMemo(() => (q.data?.sales ?? []).slice(-days), [q.data, days]);
  const inventory = (q.data?.inventory ?? []).filter(
    (item) => category === "all" || item.category === category,
  );
  const categories = [...new Set((q.data?.inventory ?? []).map((item) => item.category))].sort();
  const totalRevenue = sales.reduce((sum, day) => sum + day.revenue, 0);
  const totalOrders = sales.reduce((sum, day) => sum + day.orders, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Sales activity and shared-stock valuation from your demo records."
      />
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <section aria-labelledby="sales-report-title" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="sales-report-title" className="text-lg font-semibold">
                  Sales performance
                </h2>
                <p className="text-sm text-muted-foreground">
                  Completed consumer orders, by day in East Africa Time.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sales-period">Period</Label>
                  <select
                    id="sales-period"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {[7, 14, 30].map((period) => (
                      <option key={period} value={period}>
                        {period} days
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  disabled={!sales.length}
                  onClick={() =>
                    downloadCsv(
                      `sokoni-sales-${days}-days.csv`,
                      sales.map((row) => ({
                        date: row.day,
                        orders: row.orders,
                        revenue_ugx: row.revenue,
                      })),
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Export sales
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Revenue in period</p>
                <p className="mt-1 text-2xl font-bold tabular">{ugx(totalRevenue)}</p>
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-sm text-muted-foreground">Completed orders</p>
                <p className="mt-1 text-2xl font-bold tabular">{totalOrders}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Daily sales for the selected period</caption>
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Orders</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((row) => (
                    <tr key={row.day} className="border-t">
                      <th scope="row" className="px-3 py-2.5 text-left font-medium">
                        {row.label}
                      </th>
                      <td className="px-3 py-2.5 text-right tabular">{row.orders}</td>
                      <td className="px-3 py-2.5 text-right tabular">{ugx(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="stock-report-title" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="stock-report-title" className="text-lg font-semibold">
                  Inventory valuation
                </h2>
                <p className="text-sm text-muted-foreground">
                  Current quantities and cost value across the shared stock pool.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="stock-category">Category</Label>
                  <select
                    id="stock-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All categories</option>
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  disabled={!inventory.length}
                  onClick={() =>
                    downloadCsv(
                      "sokoni-inventory-valuation.csv",
                      inventory.map((item) => ({
                        product: item.name,
                        category: item.category,
                        location: item.location,
                        unit: item.stockUnit,
                        on_hand: item.onHand,
                        reserved: item.reserved,
                        available: item.onHand - item.reserved,
                        average_unit_cost_ugx: item.avgUnitCost,
                        stock_value_ugx: item.onHand * item.avgUnitCost,
                      })),
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Export inventory
                </Button>
              </div>
            </div>

            <DataTable
              caption="Inventory valuation"
              rows={inventory}
              search={(item) => `${item.name} ${item.category}`}
              emptyTitle="No inventory in this category"
              emptyDescription="Choose another category or receive stock from a purchase order."
              columns={[
                {
                  key: "name",
                  header: "Product",
                  cell: (item) => <span className="font-medium">{item.name}</span>,
                  sort: (item) => item.name,
                },
                {
                  key: "category",
                  header: "Category",
                  cell: (item) => <span className="capitalize">{item.category}</span>,
                  sort: (item) => item.category,
                },
                {
                  key: "location",
                  header: "Location",
                  cell: (item) => item.location,
                  sort: (item) => item.location,
                },
                {
                  key: "onHand",
                  header: "On hand",
                  cell: (item) => qty(item.onHand, item.stockUnit),
                  sort: (item) => item.onHand,
                  className: "text-right",
                },
                {
                  key: "reserved",
                  header: "Reserved",
                  cell: (item) => qty(item.reserved, item.stockUnit),
                  sort: (item) => item.reserved,
                  className: "text-right",
                },
                {
                  key: "value",
                  header: "Stock value",
                  cell: (item) => ugx(item.onHand * item.avgUnitCost),
                  sort: (item) => item.onHand * item.avgUnitCost,
                  className: "text-right whitespace-nowrap",
                },
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}
