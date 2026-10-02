import type { DemoDB, InventoryItem } from "@/models/types";
import { DomainError, uid } from "../common";

export const available = (i: InventoryItem) => Math.max(0, i.onHand - i.reserved);
export const isLowStock = (i: InventoryItem) => available(i) <= i.lowStockThreshold;
export const stockValue = (i: InventoryItem) => i.onHand * i.avgUnitCost;

export function adjustStock(
  db: DemoDB,
  itemId: string,
  delta: number,
  reason: string,
  now: string,
): DemoDB {
  if (!Number.isFinite(delta) || delta === 0) throw new DomainError("Enter a non-zero quantity.");
  if (!reason.trim()) throw new DomainError("A reason is required for stock adjustments.");
  const item = db.inventory.find((i) => i.id === itemId);
  if (!item) throw new DomainError("Inventory item not found.");
  if (item.onHand + delta < item.reserved)
    throw new DomainError(
      `Cannot reduce below reserved stock (${item.reserved} ${item.stockUnit} reserved for orders).`,
    );
  return {
    ...db,
    inventory: db.inventory.map((i) => (i.id === itemId ? { ...i, onHand: i.onHand + delta } : i)),
    movements: [
      { id: uid(), itemId, at: now, type: "adjustment", quantity: delta, reason: reason.trim() },
      ...db.movements,
    ],
  };
}

export function setThreshold(db: DemoDB, itemId: string, threshold: number): DemoDB {
  if (!Number.isFinite(threshold) || threshold < 0)
    throw new DomainError("Threshold must be zero or more.");
  return {
    ...db,
    inventory: db.inventory.map((i) =>
      i.id === itemId ? { ...i, lowStockThreshold: threshold } : i,
    ),
  };
}
