import type { DemoDB, Listing, ListingStatus, SOStatus, SalesOrder } from "@/models/types";
import { DomainError, nextId, uid } from "../common";
import { available } from "../inventory/logic";

export interface ListingInput {
  id?: string;
  inventoryItemId: string;
  title: string;
  description: string;
  retailPrice: number;
  discountPct: number;
  dailySpecial: boolean;
  imageDataUrl?: string;
}

export const effectivePrice = (l: Pick<Listing, "retailPrice" | "discountPct">) =>
  Math.round(l.retailPrice * (1 - l.discountPct / 100));

export function saveListing(
  db: DemoDB,
  input: ListingInput,
  now: string,
): { db: DemoDB; listing: Listing } {
  if (!input.title.trim()) throw new DomainError("Title is required.");
  if (!(input.retailPrice > 0)) throw new DomainError("Retail price must be greater than zero.");
  if (input.discountPct < 0 || input.discountPct > 50)
    throw new DomainError("Discount must be between 0 and 50%.");
  const item = db.inventory.find((i) => i.id === input.inventoryItemId);
  if (!item) throw new DomainError("Choose a product from your inventory.");
  if (input.id) {
    const existing = db.listings.find((l) => l.id === input.id);
    if (!existing) throw new DomainError("Listing not found.");
    const listing = { ...existing, ...input, title: input.title.trim(), updatedAt: now } as Listing;
    return {
      listing,
      db: { ...db, listings: db.listings.map((l) => (l.id === listing.id ? listing : l)) },
    };
  }
  const listing: Listing = {
    ...input,
    id: nextId(
      "L",
      db.listings.map((l) => l.id),
      0,
    ),
    title: input.title.trim(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  return { listing, db: { ...db, listings: [listing, ...db.listings] } };
}

const LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["live", "draft"],
  live: ["paused"],
  paused: ["live"],
};

export function setListingStatus(
  db: DemoDB,
  id: string,
  status: ListingStatus,
  now: string,
): DemoDB {
  const l = db.listings.find((x) => x.id === id);
  if (!l) throw new DomainError("Listing not found.");
  if (!LISTING_TRANSITIONS[l.status].includes(status))
    throw new DomainError(`Cannot move listing from ${l.status} to ${status}.`);
  return {
    ...db,
    listings: db.listings.map((x) => (x.id === id ? { ...x, status, updatedAt: now } : x)),
  };
}

export const SO_FLOW: SOStatus[] = [
  "new",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "completed",
];

function patchOrder(
  db: DemoDB,
  so: SalesOrder,
  status: SOStatus,
  now: string,
  extra: Partial<SalesOrder> = {},
): DemoDB {
  return {
    ...db,
    salesOrders: db.salesOrders.map((o) =>
      o.id === so.id ? { ...o, ...extra, status, history: [...o.history, { status, at: now }] } : o,
    ),
  };
}

function getOrder(db: DemoDB, id: string) {
  const so = db.salesOrders.find((o) => o.id === id);
  if (!so) throw new DomainError("Order not found.");
  return so;
}

/** Accepting reserves stock; fails if any line would oversell. */
export function acceptOrder(db: DemoDB, id: string, now: string): DemoDB {
  const so = getOrder(db, id);
  if (so.status !== "new") throw new DomainError("Only new orders can be accepted.");
  const needed = new Map<string, number>();
  so.lines.forEach((l) =>
    needed.set(l.inventoryItemId, (needed.get(l.inventoryItemId) ?? 0) + l.quantity),
  );
  for (const [itemId, qty] of needed) {
    const item = db.inventory.find((i) => i.id === itemId);
    if (!item) throw new DomainError("A product in this order is no longer in inventory.");
    if (available(item) < qty)
      throw new DomainError(
        `Not enough ${item.name}: ${available(item)} ${item.stockUnit} available, ${qty} needed. Restock or reject the order.`,
      );
  }
  const next = patchOrder(db, so, "accepted", now);
  return {
    ...next,
    inventory: next.inventory.map((i) =>
      needed.has(i.id) ? { ...i, reserved: i.reserved + needed.get(i.id)! } : i,
    ),
    movements: [
      ...[...needed].map(([itemId, q]) => ({
        id: uid(),
        itemId,
        at: now,
        type: "reserved" as const,
        quantity: q,
        reason: "Reserved for consumer order",
        ref: so.id,
      })),
      ...next.movements,
    ],
  };
}

export function rejectOrder(db: DemoDB, id: string, reason: string, now: string): DemoDB {
  const so = getOrder(db, id);
  if (!["new", "accepted", "preparing"].includes(so.status))
    throw new DomainError("This order can no longer be rejected.");
  if (!reason.trim()) throw new DomainError("Give the customer a reason for rejecting.");
  let next = patchOrder(db, so, "rejected", now, { rejectReason: reason.trim() });
  if (so.status !== "new") {
    next = {
      ...next,
      inventory: next.inventory.map((i) => {
        const q = so.lines
          .filter((l) => l.inventoryItemId === i.id)
          .reduce((s, l) => s + l.quantity, 0);
        return q ? { ...i, reserved: Math.max(0, i.reserved - q) } : i;
      }),
      movements: [
        ...so.lines.map((l) => ({
          id: uid(),
          itemId: l.inventoryItemId,
          at: now,
          type: "released" as const,
          quantity: -l.quantity,
          reason: "Reservation released (order rejected)",
          ref: so.id,
        })),
        ...next.movements,
      ],
    };
  }
  return next;
}

export function startPreparing(db: DemoDB, id: string, now: string): DemoDB {
  const so = getOrder(db, id);
  if (so.status !== "accepted") throw new DomainError("Accept the order before preparing it.");
  return patchOrder(db, so, "preparing", now);
}

export function setChecklist(
  db: DemoDB,
  id: string,
  key: keyof SalesOrder["checklist"],
  value: boolean,
): DemoDB {
  const so = getOrder(db, id);
  if (so.status !== "preparing")
    throw new DomainError("The quality checklist is only editable while preparing.");
  return {
    ...db,
    salesOrders: db.salesOrders.map((o) =>
      o.id === id ? { ...o, checklist: { ...o.checklist, [key]: value } } : o,
    ),
  };
}

export const checklistComplete = (so: SalesOrder) => Object.values(so.checklist).every(Boolean);

export function markReady(db: DemoDB, id: string, now: string): DemoDB {
  const so = getOrder(db, id);
  if (so.status !== "preparing")
    throw new DomainError("Only orders being prepared can be marked ready.");
  if (!checklistComplete(so)) throw new DomainError("Complete the quality checklist first.");
  return patchOrder(db, so, "ready_for_pickup", now);
}

/** Customer collected: reserved stock leaves inventory. */
export function completeOrder(db: DemoDB, id: string, now: string): DemoDB {
  const so = getOrder(db, id);
  if (so.status !== "ready_for_pickup")
    throw new DomainError("Only orders ready for pickup can be completed.");
  const next = patchOrder(db, so, "completed", now);
  return {
    ...next,
    inventory: next.inventory.map((i) => {
      const q = so.lines
        .filter((l) => l.inventoryItemId === i.id)
        .reduce((s, l) => s + l.quantity, 0);
      return q ? { ...i, onHand: i.onHand - q, reserved: Math.max(0, i.reserved - q) } : i;
    }),
    movements: [
      ...so.lines.map((l) => ({
        id: uid(),
        itemId: l.inventoryItemId,
        at: now,
        type: "sale" as const,
        quantity: -l.quantity,
        reason: "Consumer order collected",
        ref: so.id,
      })),
      ...next.movements,
    ],
  };
}

const NAMES = [
  "Agnes Atim",
  "Daniel Kato",
  "Ruth Nansubuga",
  "Peter Opio",
  "Mercy Akello",
  "Samuel Wasswa",
];

export function simulateIncomingOrder(db: DemoDB, now: string): { db: DemoDB; order: SalesOrder } {
  const live = db.listings.filter((listing) => {
    const item = db.inventory.find((inventoryItem) => inventoryItem.id === listing.inventoryItemId);
    return listing.status === "live" && item !== undefined && available(item) > 0;
  });
  if (!live.length)
    throw new DomainError("Publish at least one live listing to receive consumer orders.");
  const pick = live[Math.floor(Math.random() * live.length)];
  const item = db.inventory.find((i) => i.id === pick.inventoryItemId)!;
  const requested = item.stockUnit === "kg" ? 2 + Math.floor(Math.random() * 4) : 1;
  const quantity = Math.min(requested, available(item));
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const order: SalesOrder = {
    id: nextId(
      "SO",
      db.salesOrders.map((o) => o.id),
    ),
    customerName: name,
    customerPhone: "+256 7" + String(Math.floor(10000000 + Math.random() * 89999999)),
    pickupNote: "Pickup at shop counter",
    createdAt: now,
    status: "new",
    lines: [
      {
        listingId: pick.id,
        inventoryItemId: item.id,
        title: pick.title,
        stockUnit: item.stockUnit,
        quantity,
        unitPrice: effectivePrice(pick),
      },
    ],
    total: quantity * effectivePrice(pick),
    checklist: { qualityChecked: false, weighed: false, packed: false },
    history: [{ status: "new", at: now }],
  };
  return { order, db: { ...db, salesOrders: [order, ...db.salesOrders] } };
}
