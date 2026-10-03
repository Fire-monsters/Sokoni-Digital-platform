import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState, PageHeader } from "@/components/common";
import { catalogue, submitOrder, type WholesaleItem } from "@/services/wholesale-client";
import { ugx } from "@/lib/format";

export const Route = createFileRoute("/buy/catalogue")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: Catalogue,
});

function Catalogue() {
  const [query, setQuery] = useState(Route.useSearch().q ?? "");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [placed, setPlaced] = useState<string | null>(null);
  const [entryError, setEntryError] = useState("");
  const operation = useRef<string | null>(null);
  const qc = useQueryClient();
  const products = useQuery({
    queryKey: ["wholesale", "catalogue"],
    queryFn: catalogue,
    retry: false,
    enabled: import.meta.env.VITE_WHOLESALE_ENABLED === "true",
  });
  const list = useMemo(() => products.data ?? [], [products.data]);
  const chosen = list.filter((item) => cart[item.id] > 0);
  const warehouseId = chosen[0]?.warehouseBusinessId;
  const total = chosen.reduce((sum, item) => sum + cart[item.id] * item.priceUgxPerPackage, 0);
  const filtered = useMemo(
    () =>
      list.filter((item) =>
        `${item.name} ${item.grade} ${item.sku}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [list, query],
  );
  const submit = useMutation({
    mutationFn: async () => {
      operation.current ??= crypto.randomUUID();
      return submitOrder(
        chosen.map((item) => ({
          catalogueItemId: item.id,
          quantityPackages: cart[item.id],
          expectedPriceUgx: item.priceUgxPerPackage,
        })),
        notes,
        operation.current,
      );
    },
    onSuccess: (order) => {
      setPlaced(order.reference);
      setCart({});
      setNotes("");
      operation.current = null;
      void qc.invalidateQueries({ queryKey: ["wholesale"] });
    },
  });
  function quantity(item: WholesaleItem, count: number) {
    if (count > 0 && warehouseId && warehouseId !== item.warehouseBusinessId) {
      setEntryError("Submit one warehouse order at a time.");
      return;
    }
    setEntryError("");
    operation.current = null;
    setPlaced(null);
    setCart((previous) => {
      const next = { ...previous };
      if (count <= 0) delete next[item.id];
      else next[item.id] = Math.min(count, item.availablePackages);
      return next;
    });
  }
  if (import.meta.env.VITE_WHOLESALE_ENABLED !== "true") {
    return (
      <ErrorState
        error={new Error("The live warehouse catalogue will appear here after rollout.")}
      />
    );
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Wholesale catalogue"
        description="Published warehouse offers. Prices and available packages are checked again when you submit."
      />
      <Input
        aria-label="Search wholesale offers"
        placeholder="Search crop, grade or SKU"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {products.isPending ? (
        <LoadingState />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          No warehouse offers are published yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground">
                {item.sku} · Grade {item.grade}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{item.name}</h2>
              <p className="mt-2 text-sm">
                {item.unitsPerPackage} {item.baseUnit} per {item.packageUnit}
              </p>
              <p className="mt-1 text-sm">
                {item.availablePackages} packages offered · minimum {item.minimumPackages}
              </p>
              <p className="mt-3 font-bold">
                {ugx(item.priceUgxPerPackage)} / {item.packageUnit}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Input
                  type="number"
                  min={item.minimumPackages}
                  max={item.availablePackages}
                  aria-label={`Packages of ${item.name}`}
                  value={cart[item.id] ?? ""}
                  onChange={(event) => quantity(item, Number(event.target.value))}
                />
                <Button variant="outline" onClick={() => quantity(item, 0)}>
                  Clear
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <section className="rounded-xl border bg-card p-5" aria-label="Order summary">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingCart className="h-5 w-5" /> Order summary
        </h2>
        {chosen.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Choose packages above to begin.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-1 text-sm">
              {chosen.map((item) => (
                <li key={item.id}>
                  {item.name} · {cart[item.id]} {item.packageUnit}(s) ·{" "}
                  {ugx(cart[item.id] * item.priceUgxPerPackage)}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-bold">Total: {ugx(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Payment is arranged after warehouse confirmation. No charge is made here.
            </p>
            <Textarea
              className="mt-3"
              placeholder="Order notes (optional)"
              value={notes}
              onChange={(event) => {
                operation.current = null;
                setNotes(event.target.value);
              }}
            />
            {entryError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {entryError}
              </p>
            )}
            {submit.isError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {submit.error instanceof Error
                  ? submit.error.message
                  : "Order could not be submitted."}
              </p>
            )}
            <Button
              className="mt-3"
              disabled={
                submit.isPending ||
                chosen.some(
                  (item) =>
                    cart[item.id] < item.minimumPackages || !Number.isInteger(cart[item.id]),
                )
              }
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Submitting…" : "Submit purchase order"}
            </Button>
          </>
        )}
        {placed && (
          <p role="status" className="mt-3 text-sm text-green-800">
            Order {placed} submitted.{" "}
            <Link to="/buy/orders" search={{ status: undefined }} className="underline">
              Track it here
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
