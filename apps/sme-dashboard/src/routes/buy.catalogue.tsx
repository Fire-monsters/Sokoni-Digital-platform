import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Minus, Package, Plus, ShoppingCart, Trash2, Warehouse } from "lucide-react";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  EmptyState,
  SuccessNote,
  Spinner,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import {
  addToCart,
  checkout,
  getCart,
  getProducts,
  getProfile,
  setCartQuantity,
} from "@/services/api";
import { downloadInvoice } from "@/lib/download";
import { eat, qty, ugx } from "@/lib/format";
import type { PaymentMethod, PurchaseOrder, WholesaleProduct } from "@/models/types";

export const Route = createFileRoute("/buy/catalogue")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Wholesale catalogue — Sokoni Digital SME" },
      {
        name: "description",
        content: "Browse branded Agro-Warehouse produce, compare grades and order wholesale stock.",
      },
      { property: "og:title", content: "Wholesale catalogue — Sokoni Digital SME" },
      {
        property: "og:description",
        content: "Browse branded Agro-Warehouse produce and order wholesale stock.",
      },
    ],
  }),
  component: Catalogue,
});

const ALL = "all";

function Catalogue() {
  const search = Route.useSearch();
  const products = useDemoQuery(["products"], getProducts);
  const profile = useDemoQuery(["profile"], getProfile);
  const cart = useDemoQuery(["cart"], getCart);
  const [q, setQ] = useState(search.q ?? "");
  const [crop, setCrop] = useState<string>(ALL);
  const [category, setCategory] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [pack, setPack] = useState(ALL);
  const [avail, setAvail] = useState(ALL);
  const [maxPrice, setMaxPrice] = useState("");
  const [focusOnly, setFocusOnly] = useState(true);
  const [adding, setAdding] = useState<WholesaleProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const list = products.data ?? [];
  const opts = (f: (p: WholesaleProduct) => string) => [...new Set(list.map(f))].sort();
  const filtered = useMemo(
    () =>
      list.filter((p) => {
        if (focusOnly && profile.data && !profile.data.cropTypes.includes(p.cropType)) return false;
        if (
          q &&
          !`${p.name} ${p.sku} ${p.supplier} ${p.category}`.toLowerCase().includes(q.toLowerCase())
        )
          return false;
        if (crop !== ALL && p.cropType !== crop) return false;
        if (category !== ALL && p.category !== category) return false;
        if (grade !== ALL && p.grade !== grade) return false;
        if (pack !== ALL && p.packageUnit !== pack) return false;
        if (avail === "in" && p.availablePackages === 0) return false;
        if (avail === "out" && p.availablePackages > 0) return false;
        if (maxPrice && p.pricePerPackage > Number(maxPrice)) return false;
        return true;
      }),
    [list, q, crop, category, grade, pack, avail, maxPrice, focusOnly, profile.data],
  );

  const reset = () => {
    setQ("");
    setCrop(ALL);
    setCategory(ALL);
    setGrade(ALL);
    setPack(ALL);
    setAvail(ALL);
    setMaxPrice("");
    setFocusOnly(false);
  };
  const cartCount = cart.data?.lines.length ?? 0;

  return (
    <>
      <PageHeader
        title="Wholesale catalogue"
        description="Branded, graded produce from E-Katale Agro-Warehouses. Prices are per package; stock converts to kg or packs when received."
        actions={
          <Button onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" /> Cart{cartCount ? ` (${cartCount})` : ""}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="cq">Search products or warehouses</Label>
          <Input
            id="cq"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. coffee, Mbale"
          />
        </div>
        <FilterSelect
          id="crop"
          label="Crop type"
          value={crop}
          onChange={setCrop}
          options={[
            ["cash", "Cash crops"],
            ["food", "Food crops"],
          ]}
        />
        <FilterSelect
          id="cat"
          label="Commodity"
          value={category}
          onChange={setCategory}
          options={opts((p) => p.category).map((c) => [c, c[0].toUpperCase() + c.slice(1)])}
        />
        <FilterSelect
          id="grade"
          label="Grade"
          value={grade}
          onChange={setGrade}
          options={opts((p) => p.grade).map((g) => [g, g])}
        />
        <FilterSelect
          id="pack"
          label="Packaging"
          value={pack}
          onChange={setPack}
          options={opts((p) => p.packageUnit).map((g) => [g, g[0].toUpperCase() + g.slice(1)])}
        />
        <FilterSelect
          id="av"
          label="Availability"
          value={avail}
          onChange={setAvail}
          options={[
            ["in", "In stock"],
            ["out", "Out of stock"],
          ]}
        />
        <div>
          <Label htmlFor="mp">Max price per package (UGX)</Label>
          <Input
            id="mp"
            type="number"
            min={0}
            inputMode="numeric"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Any"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-(--primary)"
              checked={focusOnly}
              onChange={(e) => setFocusOnly(e.target.checked)}
            />{" "}
            Only my crop types (
            {profile.data?.cropTypes.map((c) => (c === "cash" ? "cash" : "food")).join(" & ") ??
              "…"}
            )
          </label>
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} products
          </span>
        </div>
      </div>

      {products.isPending ? (
        <LoadingState rows={6} />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No products match"
          description="Clear filters to see the full catalogue."
          action={
            <Button variant="outline" onClick={reset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} p={p} onAdd={() => setAdding(p)} />
          ))}
        </div>
      )}

      {adding && (
        <AddDialog
          product={adding}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            setCartOpen(true);
          }}
        />
      )}
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[][];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProductCard({ p, onAdd }: { p: WholesaleProduct; onAdd: () => void }) {
  const out = p.availablePackages === 0;
  return (
    <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{p.sku}</p>
          <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
        </div>
        <Badge variant={p.cropType === "cash" ? "accent" : "success"}>
          {p.cropType === "cash" ? "Cash crop" : "Food crop"}
        </Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">E-Katale grade</dt>
        <dd className="font-medium">{p.grade}</dd>
        <dt className="text-muted-foreground">Packaging</dt>
        <dd className="font-medium">{p.packaging}</dd>
        <dt className="text-muted-foreground">Min. order</dt>
        <dd className="font-medium">
          {p.moq} {p.packageUnit}s
        </dd>
        <dt className="text-muted-foreground">Per {p.stockUnit}</dt>
        <dd className="font-medium tabular">{ugx(p.pricePerPackage / p.unitsPerPackage)}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Warehouse className="h-3.5 w-3.5" aria-hidden />
          {p.supplier}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Delivery {p.etaDays} day{p.etaDays > 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <Package className="h-3.5 w-3.5" aria-hidden />
          {out ? "Out of stock" : `${p.availablePackages} ${p.packageUnit}s available`}
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between pt-4">
        <div>
          <p className="tabular text-xl font-bold">{ugx(p.pricePerPackage)}</p>
          <p className="text-xs text-muted-foreground">per {p.packageUnit}</p>
        </div>
        <Button
          onClick={onAdd}
          disabled={out}
          title={out ? "Out of stock at the warehouse" : undefined}
        >
          {out ? (
            "Unavailable"
          ) : (
            <>
              <Plus className="h-4 w-4" /> Add
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

function AddDialog({
  product: p,
  onClose,
  onAdded,
}: {
  product: WholesaleProduct;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [n, setN] = useState(String(p.moq));
  const m = useDemoMutation(
    (v: number) => addToCart(p.id, v),
    (_r, v) => `Added ${v} ${p.packageUnit}s of ${p.name}`,
  );
  const val = Number(n);
  const err =
    !Number.isInteger(val) || val <= 0
      ? "Enter a whole number"
      : val < p.moq
        ? `Minimum is ${p.moq}`
        : val > p.availablePackages
          ? `Only ${p.availablePackages} available`
          : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {p.name}</DialogTitle>
          <DialogDescription>
            {p.packaging} · {ugx(p.pricePerPackage)} per {p.packageUnit}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!err) m.mutate(val, { onSuccess: onAdded });
          }}
          className="space-y-3"
        >
          <Label htmlFor="qty">Quantity ({p.packageUnit}s)</Label>
          <Input
            id="qty"
            type="number"
            min={p.moq}
            max={p.availablePackages}
            value={n}
            onChange={(e) => setN(e.target.value)}
            aria-invalid={!!err}
            aria-describedby="qty-help"
            autoFocus
          />
          <p
            id="qty-help"
            className={err ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {err ||
              `= ${qty(val * p.unitsPerPackage, p.stockUnit)} into inventory · ${ugx(val * p.pricePerPackage)}`}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!err || m.isPending}>
              {m.isPending && <Spinner />} Add to cart
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CartSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const cart = useDemoQuery(["cart"], getCart);
  const profile = useDemoQuery(["profile"], getProfile);
  const setQty = useDemoMutation((v: { id: string; q: number }) => setCartQuantity(v.id, v.q));
  const [method, setMethod] = useState<PaymentMethod>("mobile_money");
  const [notes, setNotes] = useState("");
  const [placed, setPlaced] = useState<PurchaseOrder | null>(null);
  const co = useDemoMutation(
    () => checkout(method, notes),
    (o) => `Purchase order ${o.id} submitted`,
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Purchase cart</SheetTitle>
            <SheetDescription>
              Review before submitting a purchase order to the warehouse.
            </SheetDescription>
          </SheetHeader>
          {cart.isPending ? (
            <LoadingState />
          ) : cart.isError ? (
            <ErrorState error={cart.error} onRetry={() => cart.refetch()} />
          ) : cart.data.lines.length === 0 ? (
            <EmptyState title="Your cart is empty" description="Add products from the catalogue." />
          ) : (
            <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
              <ul className="divide-y">
                {cart.data.lines.map((l) => (
                  <li key={l.product.id} className="py-3">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">{l.product.name}</p>
                      <p className="tabular font-semibold">{ugx(l.lineTotal)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ugx(l.product.pricePerPackage)} / {l.product.packageUnit} · min{" "}
                      {l.product.moq}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Decrease quantity"
                        disabled={l.quantity <= l.product.moq || setQty.isPending}
                        onClick={() => setQty.mutate({ id: l.product.id, q: l.quantity - 1 })}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="tabular w-24 text-center text-sm">
                        {l.quantity} {l.product.packageUnit}s
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Increase quantity"
                        disabled={l.quantity >= l.product.availablePackages || setQty.isPending}
                        onClick={() => setQty.mutate({ id: l.product.id, q: l.quantity + 1 })}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${l.product.name}`}
                        className="ml-auto"
                        onClick={() => setQty.mutate({ id: l.product.id, q: 0 })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd className="tabular">{ugx(cart.data.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Delivery</dt>
                  <dd className="tabular">{ugx(cart.data.deliveryFee)}</dd>
                </div>
                <div className="flex justify-between font-bold">
                  <dt>Total</dt>
                  <dd className="tabular">{ugx(cart.data.total)}</dd>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated delivery within {cart.data.etaDays} day(s)
                </p>
              </dl>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Payment method</legend>
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                  className="gap-2"
                >
                  {(
                    [
                      ["mobile_money", "Mobile Money (MTN / Airtel)", "Paid instantly (simulated)"],
                      ["bank_transfer", "Bank transfer", "Payment pending until confirmed"],
                      [
                        "trade_credit",
                        "Trade credit",
                        "Not available — requires 3 months of order history",
                      ],
                    ] as const
                  ).map(([v, l, d]) => (
                    <label
                      key={v}
                      className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${v === "trade_credit" ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <RadioGroupItem
                        value={v}
                        disabled={v === "trade_credit"}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{l}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">{d}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div>
                <Label htmlFor="notes">Delivery notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deliver before 10:00, gate 2"
                />
              </div>
              <Button
                size="lg"
                disabled={co.isPending}
                onClick={() =>
                  co.mutate(undefined, {
                    onSuccess: (o) => {
                      setPlaced(o);
                      onOpenChange(false);
                      setNotes("");
                    },
                  })
                }
              >
                {co.isPending && <Spinner />} Submit purchase order · {ugx(cart.data.total)}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={!!placed} onOpenChange={(o) => !o && setPlaced(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase order submitted</DialogTitle>
            <DialogDescription>
              The warehouse will confirm and dispatch your order.
            </DialogDescription>
          </DialogHeader>
          {placed && (
            <div className="space-y-3">
              <SuccessNote>
                Order <b>{placed.id}</b> · {ugx(placed.total)} · estimated delivery by{" "}
                {eat(placed.eta)}
              </SuccessNote>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => downloadInvoice(placed, profile.data?.name ?? "")}
                >
                  Download invoice
                </Button>
                <Button asChild>
                  <Link
                    to="/buy/orders"
                    search={{ status: "open" }}
                    onClick={() => setPlaced(null)}
                  >
                    Track order
                  </Link>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
