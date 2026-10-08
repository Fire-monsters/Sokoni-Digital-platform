import type {
  CartLine,
  DemoDB,
  POStatus,
  PaymentMethod,
  PurchaseOrder,
  WholesaleProduct,
} from "@/models/types";
import { DELIVERY_FEE, DomainError, nextId, uid } from "../common";

export function cartTotals(cart: CartLine[], products: WholesaleProduct[]) {
  const lines = cart
    .map((c) => {
      const p = products.find((x) => x.id === c.productId);
      return p
        ? { product: p, quantity: c.quantity, lineTotal: c.quantity * p.pricePerPackage }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const deliveryFee = lines.length ? DELIVERY_FEE : 0;
  const maxEta = Math.max(0, ...lines.map((l) => l.product.etaDays));
  return { lines, subtotal, deliveryFee, total: subtotal + deliveryFee, etaDays: maxEta };
}

export function validateQuantity(p: WholesaleProduct, qty: number) {
  if (!Number.isInteger(qty) || qty <= 0)
    throw new DomainError("Quantity must be a whole number of packages.");
  if (p.availablePackages === 0)
    throw new DomainError(`${p.name} is out of stock at the warehouse.`);
  if (qty < p.moq) throw new DomainError(`Minimum order is ${p.moq} ${p.packageUnit}s.`);
  if (qty > p.availablePackages)
    throw new DomainError(`Only ${p.availablePackages} ${p.packageUnit}s available.`);
}

export function setCartQuantity(db: DemoDB, productId: string, qty: number): DemoDB {
  const p = db.products.find((x) => x.id === productId);
  if (!p) throw new DomainError("Product not found.");
  if (qty === 0) return { ...db, cart: db.cart.filter((c) => c.productId !== productId) };
  validateQuantity(p, qty);
  const exists = db.cart.some((c) => c.productId === productId);
  return {
    ...db,
    cart: exists
      ? db.cart.map((c) => (c.productId === productId ? { ...c, quantity: qty } : c))
      : [...db.cart, { productId, quantity: qty }],
  };
}

export function addToCart(db: DemoDB, productId: string, qty: number): DemoDB {
  const current = db.cart.find((c) => c.productId === productId)?.quantity ?? 0;
  return setCartQuantity(db, productId, current + qty);
}

export function checkout(
  db: DemoDB,
  method: PaymentMethod,
  notes: string,
  now: Date,
): { db: DemoDB; order: PurchaseOrder } {
  if (!db.cart.length) throw new DomainError("Your cart is empty.");
  if (method === "trade_credit")
    throw new DomainError("Trade credit is not yet available for this account.");
  const t = cartTotals(db.cart, db.products);
  t.lines.forEach((l) => validateQuantity(l.product, l.quantity));
  const order: PurchaseOrder = {
    id: nextId(
      "PO-2026",
      db.purchaseOrders.map((p) => p.id),
      140,
    ),
    createdAt: now.toISOString(),
    status: "submitted",
    lines: t.lines.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      packageUnit: l.product.packageUnit,
      stockUnit: l.product.stockUnit,
      unitsPerPackage: l.product.unitsPerPackage,
      quantity: l.quantity,
      unitPrice: l.product.pricePerPackage,
    })),
    subtotal: t.subtotal,
    deliveryFee: t.deliveryFee,
    total: t.total,
    paymentMethod: method,
    paymentStatus: method === "mobile_money" ? "paid" : "pending",
    eta: new Date(now.getTime() + t.etaDays * 864e5).toISOString(),
    notes: notes.trim() || undefined,
    history: [{ status: "submitted", at: now.toISOString() }],
  };
  return {
    order,
    db: {
      ...db,
      cart: [],
      purchaseOrders: [order, ...db.purchaseOrders],
      products: db.products.map((p) => {
        const l = order.lines.find((x) => x.productId === p.id);
        return l ? { ...p, availablePackages: p.availablePackages - l.quantity } : p;
      }),
    },
  };
}

export const PO_NEXT: Partial<Record<POStatus, POStatus>> = {
  submitted: "confirmed",
  confirmed: "in_transit",
};

export function advancePurchaseOrder(db: DemoDB, id: string, now: string): DemoDB {
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) throw new DomainError("Purchase order not found.");
  const next = PO_NEXT[po.status];
  if (!next)
    throw new DomainError(`Order is ${po.status.replace("_", " ")} and cannot be advanced.`);
  return update(db, id, { status: next, history: [...po.history, { status: next, at: now }] });
}

export function cancelPurchaseOrder(db: DemoDB, id: string, now: string): DemoDB {
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) throw new DomainError("Purchase order not found.");
  if (po.status !== "submitted")
    throw new DomainError("Only orders not yet confirmed by the warehouse can be cancelled.");
  return {
    ...update(db, id, {
      status: "cancelled",
      paymentStatus: po.paymentStatus === "paid" ? "refunded" : po.paymentStatus,
      history: [...po.history, { status: "cancelled", at: now }],
    }),
    products: db.products.map((p) => {
      const l = po.lines.find((x) => x.productId === p.id);
      return l ? { ...p, availablePackages: p.availablePackages + l.quantity } : p;
    }),
  };
}

/** Receives stock exactly once: converts packages to stock units and updates weighted average cost. */
export function receivePurchaseOrder(db: DemoDB, id: string, now: string): DemoDB {
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) throw new DomainError("Purchase order not found.");
  if (po.status === "received" || po.receivedAt)
    throw new DomainError("Stock for this order has already been received.");
  if (po.status !== "in_transit")
    throw new DomainError("Stock can only be received once the order is in transit.");
  let inventory = [...db.inventory];
  const movements = [...db.movements];
  for (const l of po.lines) {
    const units = l.quantity * l.unitsPerPackage;
    const unitCost = l.unitPrice / l.unitsPerPackage;
    const idx = inventory.findIndex((i) => i.productId === l.productId);
    let itemId: string;
    if (idx >= 0) {
      const it = inventory[idx];
      const avg = Math.round((it.onHand * it.avgUnitCost + units * unitCost) / (it.onHand + units));
      inventory[idx] = { ...it, onHand: it.onHand + units, avgUnitCost: avg };
      itemId = it.id;
    } else {
      const p = db.products.find((x) => x.id === l.productId)!;
      itemId = uid("i");
      inventory = [
        ...inventory,
        {
          id: itemId,
          productId: p.id,
          name: p.name,
          location: "Dry goods store",
          category: p.category,
          cropType: p.cropType,
          stockUnit: p.stockUnit,
          onHand: units,
          reserved: 0,
          lowStockThreshold: Math.round(units * 0.3),
          avgUnitCost: Math.round(unitCost),
        },
      ];
    }
    movements.unshift({
      id: uid(),
      itemId,
      at: now,
      type: "received",
      quantity: units,
      reason: `${l.quantity} ${l.packageUnit}s × ${l.unitsPerPackage} ${l.stockUnit} received`,
      ref: po.id,
    });
  }
  return {
    ...update(db, id, {
      status: "received",
      receivedAt: now,
      paymentStatus: "paid",
      history: [...po.history, { status: "received", at: now }],
    }),
    inventory,
    movements,
  };
}

function update(db: DemoDB, id: string, patch: Partial<PurchaseOrder>): DemoDB {
  return {
    ...db,
    purchaseOrders: db.purchaseOrders.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}
