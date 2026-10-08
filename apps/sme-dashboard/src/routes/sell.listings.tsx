import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Plus, Star } from "lucide-react";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  EmptyState,
  Spinner,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import { getInventory, getListings, saveListing, setListingStatus } from "@/services/api";
import { qty, ugx } from "@/lib/format";
import type { ListingStatus } from "@/models/types";

export const Route = createFileRoute("/sell/listings")({
  head: () => ({
    meta: [
      { title: "Consumer listings — Sokoni Digital SME" },
      {
        name: "description",
        content: "Create storefront listings from your stock, set retail prices and promotions.",
      },
      { property: "og:title", content: "Consumer listings — Sokoni Digital SME" },
      { property: "og:description", content: "Create storefront listings from your stock." },
    ],
  }),
  component: Listings,
});

type L = Awaited<ReturnType<typeof getListings>>[number];

function Listings() {
  const q = useDemoQuery(["listings"], getListings);
  const [editing, setEditing] = useState<L | "new" | null>(null);
  const status = useDemoMutation(
    setListingStatus,
    (_r, v) =>
      ({
        pending_review: "Submitted for marketplace review",
        live: "Listing is live on the marketplace",
        paused: "Listing paused",
        draft: "Moved back to draft",
      })[v.status],
  );

  const actions = (
    l: L,
  ): {
    label: string;
    to: ListingStatus;
    variant?: "outline" | "secondary";
    disabled?: string;
  }[] => {
    switch (l.status) {
      case "draft":
        return [{ label: "Submit for review", to: "pending_review" }];
      case "pending_review":
        return [{ label: "Simulate: approve", to: "live", variant: "secondary" }];
      case "live":
        return [{ label: "Pause", to: "paused", variant: "outline" }];
      case "paused":
        return [
          {
            label: "Resume",
            to: "live",
            disabled: l.available <= 0 ? "No available stock" : undefined,
          },
        ];
    }
  };

  return (
    <>
      <PageHeader
        title="Consumer listings"
        description="Your storefront on the E-Katale consumer marketplace. Availability comes directly from inventory."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New listing
          </Button>
        }
      />
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          title="No listings yet"
          description="Create a listing from a product you hold in stock."
          action={<Button onClick={() => setEditing("new")}>New listing</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((l) => (
            <article
              key={l.id}
              className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className="relative grid h-32 place-items-center bg-secondary">
                {l.imageDataUrl ? (
                  <img src={l.imageDataUrl} alt={l.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-4xl font-bold text-primary/40" aria-hidden>
                    {l.title[0]}
                  </span>
                )}
                {l.dailySpecial && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                    <Star className="h-3 w-3" aria-hidden /> Daily special
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{l.title}</h3>
                  <StatusBadge status={l.status} />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {l.description || "No description"}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-lg font-bold">{ugx(l.effectivePrice)}</span>
                  <span className="text-xs text-muted-foreground">per {l.item?.stockUnit}</span>
                  {l.discountPct > 0 && (
                    <span className="tabular text-xs text-muted-foreground line-through">
                      {ugx(l.retailPrice)}
                    </span>
                  )}
                </div>
                <p
                  className={`text-sm ${l.available <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {l.available <= 0
                    ? "Sold out — restock to sell"
                    : `${qty(l.available, l.item?.stockUnit ?? "")} available`}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                    Edit
                  </Button>
                  {actions(l).map((a) => (
                    <Button
                      key={a.to}
                      size="sm"
                      variant={a.variant}
                      disabled={!!a.disabled || status.isPending}
                      title={a.disabled}
                      onClick={() => status.mutate({ id: l.id, status: a.to })}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
                {l.status === "pending_review" && (
                  <p className="text-xs text-muted-foreground">
                    Marketplace review normally takes a few hours. Use "Simulate: approve" in this
                    demo.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <ListingForm
          listing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ListingForm({ listing, onClose }: { listing: L | null; onClose: () => void }) {
  const inv = useDemoQuery(["inventory"], getInventory);
  const [itemId, setItemId] = useState(listing?.inventoryItemId ?? "");
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [price, setPrice] = useState(listing ? String(listing.retailPrice) : "");
  const [discount, setDiscount] = useState(String(listing?.discountPct ?? 0));
  const [special, setSpecial] = useState(listing?.dailySpecial ?? false);
  const [image, setImage] = useState<string | undefined>(listing?.imageDataUrl);
  const [imgErr, setImgErr] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useDemoMutation(
    saveListing,
    listing ? "Listing updated" : "Draft listing created — submit it for review to go live",
  );
  const item = inv.data?.find((i) => i.id === itemId);
  const errors = {
    item: !itemId ? "Choose a product in stock" : "",
    title: !title.trim() ? "Title is required" : "",
    price: !(Number(price) > 0) ? "Enter a price above 0" : "",
    discount: Number(discount) < 0 || Number(discount) > 50 ? "0–50%" : "",
  };
  const valid = Object.values(errors).every((e) => !e);

  const onFile = (f?: File) => {
    setImgErr("");
    if (!f) return;
    if (!f.type.startsWith("image/")) return setImgErr("Choose an image file.");
    if (f.size > 400_000) return setImgErr("Image must be under 400 KB in this demo.");
    const r = new FileReader();
    r.onload = () => setImage(String(r.result));
    r.readAsDataURL(f);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{listing ? "Edit listing" : "New consumer listing"}</DialogTitle>
          <DialogDescription>Only products in your inventory can be listed.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid)
              save.mutate(
                {
                  id: listing?.id,
                  inventoryItemId: itemId,
                  title,
                  description,
                  retailPrice: Number(price),
                  discountPct: Number(discount),
                  dailySpecial: special,
                  imageDataUrl: image,
                },
                { onSuccess: onClose },
              );
          }}
        >
          <div>
            <Label htmlFor="item">Product from inventory</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                const it = inv.data?.find((i) => i.id === v);
                if (it && !title) setTitle(`${it.name} — per ${it.stockUnit}`);
                if (it && !price) setPrice(String(it.pricing.suggested));
              }}
            >
              <SelectTrigger id="item" aria-invalid={touched && !!errors.item}>
                <SelectValue placeholder={inv.isPending ? "Loading…" : "Select product"} />
              </SelectTrigger>
              <SelectContent>
                {inv.data?.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({qty(i.available, i.stockUnit)} available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && errors.item && <p className="text-xs text-destructive">{errors.item}</p>}
          </div>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={touched && !!errors.title}
            />
            {touched && errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Retail price (UGX per {item?.stockUnit ?? "unit"})</Label>
              <Input
                id="price"
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={touched && !!errors.price}
              />
              {touched && errors.price ? (
                <p className="text-xs text-destructive">{errors.price}</p>
              ) : (
                item && (
                  <p className="text-xs text-muted-foreground">
                    Suggested {ugx(item.pricing.suggested)} · cost {ugx(item.avgUnitCost)}
                  </p>
                )
              )}
            </div>
            <div>
              <Label htmlFor="disc">Discount %</Label>
              <Input
                id="disc"
                type="number"
                min={0}
                max={50}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                aria-invalid={touched && !!errors.discount}
              />
              {touched && errors.discount && (
                <p className="text-xs text-destructive">{errors.discount}</p>
              )}
            </div>
          </div>
          {item &&
            Number(price) > 0 &&
            Number(price) * (1 - Number(discount) / 100) < item.avgUnitCost && (
              <p role="alert" className="rounded bg-warning-soft p-2 text-xs text-warning">
                Warning: this price is below your average purchase cost.
              </p>
            )}
          <label className="flex items-center justify-between rounded-md border p-2.5 text-sm">
            <span>Mark as Daily Special</span>
            <Switch checked={special} onCheckedChange={setSpecial} />
          </label>
          <div>
            <Label htmlFor="img">Photo (optional)</Label>
            <div className="flex items-center gap-3">
              {image ? (
                <img src={image} alt="" className="h-14 w-14 rounded object-cover" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded bg-muted">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />
                </span>
              )}
              <Input
                id="img"
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              {image && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImage(undefined)}>
                  Remove
                </Button>
              )}
            </div>
            {imgErr && <p className="text-xs text-destructive">{imgErr}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Bundle offers are planned for a later release.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />} {listing ? "Save changes" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
