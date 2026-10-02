import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "@/mocks/fixtures";
import {
  advancePurchaseOrder,
  checkout,
  receivePurchaseOrder,
  setCartQuantity,
} from "@/features/purchasing/logic";
import {
  acceptOrder,
  completeOrder,
  markReady,
  saveListing,
  setChecklist,
  setListingStatus,
  simulateIncomingOrder,
  startPreparing,
} from "@/features/selling/logic";

const now = "2026-10-01T09:00:00.000Z";

afterEach(() => vi.restoreAllMocks());

describe("SME demo journeys", () => {
  it("buys, receives, lists, reserves, and dispatches stock exactly once", () => {
    const started = createSeed(new Date(now));
    const cart = setCartQuantity(started, "p1", 2);
    const placed = checkout(cart, "mobile_money", "", new Date(now));

    expect(placed.order.subtotal).toBe(2_040_000);
    expect(placed.order.total).toBe(2_065_000);

    const confirmed = advancePurchaseOrder(placed.db, placed.order.id, now);
    const inTransit = advancePurchaseOrder(confirmed, placed.order.id, now);
    const received = receivePurchaseOrder(inTransit, placed.order.id, now);
    const stock = received.inventory.find((item) => item.productId === "p1");
    expect(stock?.onHand).toBe(120);
    expect(
      received.movements.filter(
        (movement) => movement.ref === placed.order.id && movement.type === "received",
      ),
    ).toHaveLength(1);
    expect(() => receivePurchaseOrder(received, placed.order.id, now)).toThrow(
      "already been received",
    );
    expect(received.inventory.find((item) => item.productId === "p1")?.onHand).toBe(120);

    const draft = saveListing(
      received,
      {
        inventoryItemId: stock!.id,
        title: "Arabica coffee by the kilo",
        description: "Fresh Ugandan coffee",
        retailPrice: 20_000,
        discountPct: 0,
        dailySpecial: false,
      },
      now,
    );
    const inReview = setListingStatus(draft.db, draft.listing.id, "pending_review", now);
    const published = setListingStatus(inReview, draft.listing.id, "live", now);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const incoming = simulateIncomingOrder(published, now);
    const accepted = acceptOrder(incoming.db, incoming.order.id, now);
    const quantity = incoming.order.lines[0].quantity;

    expect(accepted.inventory.find((item) => item.id === stock!.id)?.reserved).toBe(quantity);
    expect(() => acceptOrder(accepted, incoming.order.id, now)).toThrow(
      "Only new orders can be accepted",
    );

    let preparing = startPreparing(accepted, incoming.order.id, now);
    for (const key of ["qualityChecked", "weighed", "packed"] as const) {
      preparing = setChecklist(preparing, incoming.order.id, key, true);
    }
    const ready = markReady(preparing, incoming.order.id, now);
    const completed = completeOrder(ready, incoming.order.id, now);
    expect(completed.inventory.find((item) => item.id === stock!.id)).toMatchObject({
      onHand: 120 - quantity,
      reserved: 0,
    });
    expect(() => completeOrder(completed, incoming.order.id, now)).toThrow(
      "Only orders ready for pickup",
    );
    expect(completed.inventory.find((item) => item.id === stock!.id)?.onHand).toBe(120 - quantity);
  });

  it("limits simulated orders to available stock", () => {
    const db = createSeed(new Date(now));
    db.inventory = db.inventory.map((item) => (item.id === "i5" ? { ...item, onHand: 1 } : item));
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    const { order } = simulateIncomingOrder(db, now);

    expect(order.lines[0].inventoryItemId).toBe("i5");
    expect(order.lines[0].quantity).toBe(1);
  });
});
