import type { DemoDB, InventoryItem, PackageUnit } from "@/models/types";
import { PLATFORM_COMMISSION_RATE } from "../common";
import { available, isLowStock, stockValue } from "../inventory/logic";

const DAY = 864e5;
/** YYYY-MM-DD key in East Africa Time */
export const eatDayKey = (iso: string | Date) =>
  new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);

export function overviewKpis(db: DemoDB, now: Date) {
  const today = eatDayKey(now);
  const completedToday = db.salesOrders.filter(
    (o) => o.status === "completed" && eatDayKey(o.history.at(-1)!.at) === today,
  );
  const thirty = now.getTime() - 30 * DAY;
  return {
    revenueToday: completedToday.reduce((s, o) => s + o.total, 0),
    ordersToday: db.salesOrders.filter((o) => eatDayKey(o.createdAt) === today).length,
    ordersNeedingAction: db.salesOrders.filter((o) =>
      ["new", "accepted", "preparing", "ready_for_pickup"].includes(o.status),
    ).length,
    newOrders: db.salesOrders.filter((o) => o.status === "new").length,
    purchaseSpend30d: db.purchaseOrders
      .filter((p) => p.status !== "cancelled" && new Date(p.createdAt).getTime() >= thirty)
      .reduce((s, p) => s + p.total, 0),
    pendingDeliveries: db.purchaseOrders.filter((p) =>
      ["submitted", "confirmed", "in_transit"].includes(p.status),
    ).length,
    stockValue: db.inventory.reduce((s, i) => s + stockValue(i), 0),
    lowStock: db.inventory.filter(isLowStock).length,
    purchaseOrdersTotal: db.purchaseOrders.length,
  };
}

export function salesByDay(db: DemoDB, now: Date, days = 14) {
  const rows: { day: string; label: string; revenue: number; orders: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now.getTime() - d * DAY);
    const key = eatDayKey(date);
    rows.push({
      day: key,
      label: new Intl.DateTimeFormat("en-UG", {
        timeZone: "Africa/Kampala",
        day: "numeric",
        month: "short",
      }).format(date),
      revenue: 0,
      orders: 0,
    });
  }
  for (const o of db.salesOrders) {
    if (o.status !== "completed") continue;
    const row = rows.find((r) => r.day === eatDayKey(o.history.at(-1)!.at));
    if (row) {
      row.revenue += o.total;
      row.orders += 1;
    }
  }
  return rows;
}

export function velocityPerDay(db: DemoDB, itemId: string, now: Date, days = 14) {
  const since = now.getTime() - days * DAY;
  const sold = db.salesOrders
    .filter((o) => o.status === "completed" && new Date(o.createdAt).getTime() >= since)
    .flatMap((o) => o.lines)
    .filter((l) => l.inventoryItemId === itemId)
    .reduce((s, l) => s + l.quantity, 0);
  return sold / days;
}

export interface RestockRecommendation {
  item: InventoryItem;
  velocity: number;
  daysCover: number;
  suggestedPackages: number;
  packageUnit: PackageUnit;
  unitsPerPackage: number;
  productId: string;
  urgency: "high" | "medium";
  reason: string;
}

export function restockRecommendations(db: DemoDB, now: Date): RestockRecommendation[] {
  const focus = new Set(db.profile.categories);
  return db.inventory
    .filter((i) => focus.size === 0 || focus.has(i.category))
    .map((item) => {
      const p = db.products.find((x) => x.id === item.productId)!;
      const velocity = velocityPerDay(db, item.id, now);
      const avail = available(item);
      const daysCover = velocity > 0 ? avail / velocity : Infinity;
      const target = Math.max(item.lowStockThreshold * 1.5, velocity * 14);
      const gapUnits = Math.max(0, target - avail);
      const suggestedPackages = Math.max(p.moq, Math.ceil(gapUnits / p.unitsPerPackage));
      const needs = isLowStock(item) || daysCover < 7 + p.etaDays;
      if (!needs) return null;
      const urgency: "high" | "medium" =
        daysCover < p.etaDays + 2 || avail <= item.lowStockThreshold * 0.5 ? "high" : "medium";
      const reason =
        velocity > 0
          ? `Selling ~${velocity.toFixed(1)} ${item.stockUnit}/day; ${Number.isFinite(daysCover) ? Math.floor(daysCover) : "∞"} days of cover left, delivery takes ${p.etaDays} day(s).`
          : `Below your low-stock threshold of ${item.lowStockThreshold} ${item.stockUnit}.`;
      return {
        item,
        velocity,
        daysCover,
        suggestedPackages,
        packageUnit: p.packageUnit,
        unitsPerPackage: p.unitsPerPackage,
        productId: p.id,
        urgency,
        reason,
      };
    })
    .filter((x): x is RestockRecommendation => !!x)
    .sort((a, b) => a.daysCover - b.daysCover);
}

export function pricingSuggestion(db: DemoDB, item: InventoryItem, now: Date) {
  const p = db.products.find((x) => x.id === item.productId);
  const benchmark = p?.marketPricePerUnit ?? item.avgUnitCost * 1.3;
  const velocity = velocityPerDay(db, item.id, now);
  const cover = velocity > 0 ? available(item) / velocity : 99;
  let margin = 0.25;
  if (isLowStock(item)) margin += 0.05;
  if (cover > 30) margin -= 0.05;
  const costBased = item.avgUnitCost * (1 + margin);
  const suggested = Math.max(
    Math.round(item.avgUnitCost * 1.08),
    Math.round((costBased + benchmark) / 2 / 100) * 100,
  );
  return {
    suggested,
    benchmark,
    cost: item.avgUnitCost,
    rationale: `Average purchase cost ${Math.round(item.avgUnitCost).toLocaleString()} UGX, market benchmark ${benchmark.toLocaleString()} UGX${isLowStock(item) ? ", stock is low so a slightly higher margin is applied" : cover > 30 ? ", stock is high so a lower margin helps it move" : ""}.`,
  };
}

export function financeLedger(db: DemoDB) {
  const receipts = db.salesOrders
    .filter((o) => o.status === "completed")
    .map((o) => {
      const commission = Math.round(o.total * PLATFORM_COMMISSION_RATE);
      return {
        id: o.id,
        at: o.history.at(-1)!.at,
        customer: o.customerName,
        gross: o.total,
        commission,
        net: o.total - commission,
        status: "released" as const,
      };
    });
  const pendingEscrow = db.salesOrders
    .filter((o) => ["accepted", "preparing", "ready_for_pickup"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);
  const invoices = db.purchaseOrders.map((p) => ({
    id: p.id,
    at: p.createdAt,
    amount: p.total,
    method: p.paymentMethod,
    paymentStatus: p.paymentStatus,
    status: p.status,
  }));
  const gross = receipts.reduce((s, r) => s + r.gross, 0);
  const commission = receipts.reduce((s, r) => s + r.commission, 0);
  const paidOut = invoices
    .filter((i) => i.paymentStatus === "paid")
    .reduce((s, i) => s + i.amount, 0);
  return {
    receipts,
    invoices,
    totals: { gross, commission, net: gross - commission, paidOut, pendingEscrow },
  };
}

export function stockByCategory(db: DemoDB) {
  const m = new Map<string, number>();
  db.inventory.forEach((i) => m.set(i.category, (m.get(i.category) ?? 0) + stockValue(i)));
  return [...m].map(([category, value]) => ({ category, value }));
}
