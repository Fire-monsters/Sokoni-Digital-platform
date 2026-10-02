/**
 * Async service layer. UI calls these; replace bodies with HTTP calls later.
 */
import type { BusinessProfile, ListingStatus, PaymentMethod, SalesOrder } from "@/models/types";
import { mutate, query, resetDB, setSimulateFailure, getSimulateFailure } from "./store";
import * as purchasing from "@/features/purchasing/logic";
import * as inv from "@/features/inventory/logic";
import * as sell from "@/features/selling/logic";
import * as analytics from "@/features/analytics/logic";

const nowIso = () => new Date().toISOString();

// ---- Reads
export const getProfile = () => query((db) => db.profile, 150);
export const getProducts = () => query((db) => db.products);
export const getCart = () =>
  query((db) => ({ cart: db.cart, ...purchasing.cartTotals(db.cart, db.products) }), 150);
export const getPurchaseOrders = () => query((db) => db.purchaseOrders);
export const getInventory = () =>
  query((db) =>
    db.inventory.map((i) => ({
      ...i,
      available: inv.available(i),
      low: inv.isLowStock(i),
      value: inv.stockValue(i),
      pricing: analytics.pricingSuggestion(db, i, new Date()),
      velocity: analytics.velocityPerDay(db, i.id, new Date()),
    })),
  );
export const getMovements = (itemId: string) =>
  query((db) => db.movements.filter((m) => m.itemId === itemId), 150);
export const getListings = () =>
  query((db) =>
    db.listings.map((l) => {
      const item = db.inventory.find((i) => i.id === l.inventoryItemId);
      return {
        ...l,
        item,
        available: item ? inv.available(item) : 0,
        effectivePrice: sell.effectivePrice(l),
      };
    }),
  );
export const getSalesOrders = () =>
  query((db) =>
    db.salesOrders.map((o) => ({
      ...o,
      stock: o.lines.map((l) => {
        const i = db.inventory.find((x) => x.id === l.inventoryItemId);
        return { itemId: l.inventoryItemId, available: i ? inv.available(i) : 0 };
      }),
    })),
  );
export const getOverview = () =>
  query((db) => {
    const now = new Date();
    return {
      profile: db.profile,
      kpis: analytics.overviewKpis(db, now),
      sales: analytics.salesByDay(db, now),
      restock: analytics.restockRecommendations(db, now),
      actionOrders: db.salesOrders
        .filter((o) => ["new", "accepted", "preparing", "ready_for_pickup"].includes(o.status))
        .slice(0, 6),
      incoming: db.purchaseOrders.filter((p) =>
        ["submitted", "confirmed", "in_transit"].includes(p.status),
      ),
      lowStock: db.inventory
        .filter(inv.isLowStock)
        .map((i) => ({ ...i, available: inv.available(i) })),
    };
  });
export const getFinance = () => query((db) => analytics.financeLedger(db));
export const getReports = () =>
  query((db) => ({
    sales: analytics.salesByDay(db, new Date(), 30),
    stock: analytics.stockByCategory(db),
    inventory: db.inventory.map((i) => ({ ...i, available: inv.available(i) })),
  }));

// ---- Writes
const wrap = <R>(
  fn: (db: import("@/models/types").DemoDB) => { db: import("@/models/types").DemoDB; result: R },
) => mutate(fn);
const noResult = (db: import("@/models/types").DemoDB) => ({ db, result: true as const });

export const addToCart = (productId: string, qty: number) =>
  wrap((db) => noResult(purchasing.addToCart(db, productId, qty)));
export const setCartQuantity = (productId: string, qty: number) =>
  wrap((db) => noResult(purchasing.setCartQuantity(db, productId, qty)));
export const checkout = (method: PaymentMethod, notes: string) =>
  wrap((db) => {
    const r = purchasing.checkout(db, method, notes, new Date());
    return { db: r.db, result: r.order };
  });
export const advancePurchaseOrder = (id: string) =>
  wrap((db) => noResult(purchasing.advancePurchaseOrder(db, id, nowIso())));
export const cancelPurchaseOrder = (id: string) =>
  wrap((db) => noResult(purchasing.cancelPurchaseOrder(db, id, nowIso())));
export const receivePurchaseOrder = (id: string) =>
  wrap((db) => noResult(purchasing.receivePurchaseOrder(db, id, nowIso())));

export const adjustStock = (v: { itemId: string; delta: number; reason: string }) =>
  wrap((db) => noResult(inv.adjustStock(db, v.itemId, v.delta, v.reason, nowIso())));
export const setThreshold = (v: { itemId: string; threshold: number }) =>
  wrap((db) => noResult(inv.setThreshold(db, v.itemId, v.threshold)));

export const saveListing = (input: sell.ListingInput) =>
  wrap((db) => {
    const r = sell.saveListing(db, input, nowIso());
    return { db: r.db, result: r.listing };
  });
export const setListingStatus = (v: { id: string; status: ListingStatus }) =>
  wrap((db) => noResult(sell.setListingStatus(db, v.id, v.status, nowIso())));

export const acceptOrder = (id: string) =>
  wrap((db) => noResult(sell.acceptOrder(db, id, nowIso())));
export const rejectOrder = (v: { id: string; reason: string }) =>
  wrap((db) => noResult(sell.rejectOrder(db, v.id, v.reason, nowIso())));
export const startPreparing = (id: string) =>
  wrap((db) => noResult(sell.startPreparing(db, id, nowIso())));
export const setChecklist = (v: {
  id: string;
  key: keyof SalesOrder["checklist"];
  value: boolean;
}) => wrap((db) => noResult(sell.setChecklist(db, v.id, v.key, v.value)));
export const markReady = (id: string) => wrap((db) => noResult(sell.markReady(db, id, nowIso())));
export const completeOrder = (id: string) =>
  wrap((db) => noResult(sell.completeOrder(db, id, nowIso())));
export const simulateIncomingOrder = () =>
  wrap((db) => {
    const r = sell.simulateIncomingOrder(db, nowIso());
    return { db: r.db, result: r.order };
  });

export const updateProfile = (p: BusinessProfile) =>
  wrap((db) => {
    if (!p.name.trim()) throw new Error("Business name is required.");
    if (!p.cropTypes.length) throw new Error("Select cash crops, food crops or both.");
    return { db: { ...db, profile: p }, result: true as const };
  });

export async function resetDemo() {
  setSimulateFailure(false);
  resetDB();
}
export const simulation = { get: getSimulateFailure, set: setSimulateFailure };
