import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Demo attempted a network request");
    }),
  );
  vi.stubEnv("VITE_API_URL", "https://live.invalid");
  vi.stubEnv("VITE_SUPABASE_URL", "https://auth.invalid");
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("local operations workflows", () => {
  it("reviews an application, filters queues, and records the demo operator", async () => {
    const s = await import("./service");
    const queue = await s.fetchApplicationQueue({ type: "vendor", status: "pending_review" });
    const id = queue.data[0].id;
    await s.reviewApplication(id, "start-review", {
      operationId: "start",
      expectedVersion: 1,
      reason: "Demo review started",
    });
    expect(
      (await s.fetchApplicationQueue({ type: "vendor", status: "pending_review" })).data,
    ).toHaveLength(0);
    expect((await s.fetchApplicationReview(id)).reviewerName).toBe("Demo operator");
    await s.reviewApplication(id, "approve", {
      operationId: "approve",
      expectedVersion: 2,
      reason: "Demo requirements met",
    });
    expect((await s.fetchApplicationQueue({ type: "vendor", status: "approved" })).data[0].id).toBe(
      id,
    );
    expect((await s.fetchAuditEvents({ entityType: "application" })).data).toHaveLength(2);
    await expect(
      s.reviewApplication(id, "notes", {
        operationId: "stale",
        expectedVersion: 1,
        reason: "Stale note",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("updates catalogue and prices without losing changes when reread", async () => {
    const s = await import("./service");
    const listing = (await s.fetchAdminListingQueue()).listings[0];
    await s.approveAdminListing(listing.id, listing.version, "approve", "Demo approval");
    const price = (await s.fetchAdminPriceQueue()).requests[0];
    await s.reviewAdminPrice(price.requestId, "approve", "price", 0, "Demo adjustment");
    expect((await s.fetchAdminPriceQueue()).requests).toHaveLength(0);
    const updated = (await s.fetchAdminListingQueue()).listings[0];
    expect(updated.approvedPriceUgx).toBe(4500);
    expect(updated.priceHistory).toHaveLength(1);
  });
  it("assigns riders, escalates orders, and resolves the shared delivery issue", async () => {
    const s = await import("./service");
    const d = (await s.fetchDispatcherDeliveryBoard()).deliveries[0];
    await s.assignDispatcherDelivery(d.id, false, {
      transporterId: "demo-rider",
      reason: "Demo assignment",
      expectedVersion: d.version,
      operationId: "assign",
    });
    const order = await s.fetchOrderInvestigation("demo-order-0");
    expect(order.delivery?.rider?.name).toBe("Demo Rider");
    const result = await s.escalateOrderToDispatch(
      order.order.id,
      "issue",
      "Demo issue",
      order.delivery!.version,
    );
    expect((await s.fetchDispatcherDeliveryBoard()).issues).toHaveLength(1);
    const latest = await s.fetchDispatcherDelivery(d.id);
    await s.resolveDispatcherDeliveryIssue(result.issueId!, {
      resolutionCode: "CLOSED_NO_ACTION",
      resolutionNote: "Demo resolved",
      reason: "Demo resolved",
      expectedVersion: latest.delivery.version,
      operationId: "resolve",
    });
    expect((await s.fetchDispatcherDeliveryBoard()).issues).toHaveLength(0);
    await s.performDispatcherDeliveryAction(d.id, {
      action: "CANCEL_ASSIGNMENT",
      reason: "Demo cancel",
      expectedVersion: latest.delivery.version + 1,
      operationId: "cancel",
    });
    expect((await s.fetchDispatcherDelivery(d.id)).assignedRider).toBeNull();
  });
  it("simulates reconciliation, refund requests, notes, notifications and cancellation", async () => {
    const s = await import("./service");
    expect((await s.reconcilePendingPayments("batch", "Demo batch")).resolved).toBe(1);
    const p = await s.fetchPaymentFinanceDetail("demo-payment-1");
    await s.commandPaymentFinance(p.id, "request-refund", {
      operationId: "refund",
      expectedVersion: p.version,
      reason: "Demo request",
      reasonCode: "other",
      amount: 1000,
    });
    expect((await s.fetchOrderInvestigation("demo-order-1")).refunds[0].requestedAmount).toBe(1000);
    await s.addOrderSupportNote("demo-order-1", "note", "Demo support note", 0);
    await s.resendOrderNotification(
      "demo-order-1",
      "demo-notification-1",
      "notify",
      "Demo resend",
      0,
    );
    const order = await s.fetchOrderInvestigation("demo-order-1");
    expect(order.supportNotes[0].author.name).toBe("Demo operator");
    expect(order.notifications[0].deliveries[0]).toMatchObject({
      status: "simulated",
      attemptCount: 2,
    });
    await s.cancelUnpaidOrder("demo-order-0", "cancel", "Demo cancellation", 0);
    expect((await s.fetchOrderInvestigation("demo-order-0")).order.status).toBe("cancelled");
    expect((await s.fetchAuditEvents({ q: "simulated_notification" })).data).toHaveLength(1);
  });
  it("isolates returned snapshots and resets fixtures on a fresh module load", async () => {
    let s = await import("./service");
    const p = await s.fetchPaymentFinanceDetail("demo-payment-0");
    p.status = "tampered";
    expect((await s.fetchPaymentFinanceDetail(p.id)).status).toBe("failed");
    await s.recheckPayment(p.id, "check", p.version, "Demo recheck");
    expect((await s.fetchPaymentFinanceDetail(p.id)).status).toBe("successful");
    vi.resetModules();
    s = await import("./service");
    expect((await s.fetchPaymentFinanceDetail(p.id)).status).toBe("failed");
  });
});
