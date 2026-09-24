import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderInvestigation } from "@sokoni-digital/domain";
import { OrderInvestigationPage } from "./OrderInvestigationPage";

const auth = vi.hoisted(() => ({ permissions: ["orders.read"] as string[] }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "token",
    can: (permission: string) => auth.permissions.includes(permission),
  }),
}));
const detail: OrderInvestigation = {
  order: {
    id: "order",
    reference: "EK-TEST",
    status: "awaiting_payment",
    fulfilmentType: "delivery",
    market: { id: "market", name: "Kitooro" },
    pricing: {
      itemsSubtotal: 10000,
      deliveryFee: 3000,
      serviceFee: 0,
      total: 13000,
      currency: "UGX",
    },
    createdAt: "2026-09-24T10:00:00Z",
    updatedAt: "2026-09-24T10:10:00Z",
  },
  consumer: { id: "consumer", name: "Test Customer", phoneMasked: "+256******352" },
  deliveryAddress: { summary: "Test address" },
  payment: { id: "payment", status: "paid", amount: 13000, currency: "UGX" },
  vendors: [
    {
      vendor: { id: "vendor", name: "Test Vendor", market: { id: "market", name: "Kitooro" } },
      sellerOrder: { id: "seller-order", reference: "EK-S-1", status: "preparing" },
      items: [{ id: "item", productName: "Beans", quantity: 2 }],
      evidence: [
        {
          id: "evidence",
          url: "https://signed.test/evidence",
          thumbnailUrl: null,
          mimeType: "image/jpeg",
          capturedAt: "2026-09-24T10:05:00Z",
        },
      ],
    },
  ],
  delivery: {
    id: "delivery",
    reference: "DL-1",
    status: "assigned",
    version: 2,
    rider: { id: "rider", name: "Test Rider", phoneMasked: "+256******353" },
    issues: [],
    evidence: [],
  },
  timeline: [],
  notifications: [
    {
      id: "notification",
      type: "vendor_order.preparing",
      entityType: "vendor_order",
      title: "Preparing",
      body: "Order is being prepared.",
      priority: "normal",
      createdAt: "2026-09-24T10:05:00Z",
      deliveries: [{ channel: "push", status: "delivered", attemptCount: 1 }],
    },
  ],
  refunds: [],
  supportNotes: [],
};
function render(data: OrderInvestigation = detail) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard/orders/order"]}>
      <OrderInvestigationPage initialData={data} />
    </MemoryRouter>,
  );
}
describe("order investigation page", () => {
  beforeEach(() => {
    auth.permissions = ["orders.read"];
  });
  it("renders the investigation narrative with masked contacts for read-only staff", () => {
    const html = render();
    expect(html).toContain("What happened?");
    expect(html).toContain("Vendor progress and items");
    expect(html).toContain("Notifications");
    expect(html).toContain("+256******352");
    expect(html).not.toContain("Reveal phone number");
    expect(html).not.toContain("Cancel unpaid order");
  });
  it("shows audited support and notification actions only with their permissions", () => {
    auth.permissions = ["orders.read", "orders.support", "notifications.manage"];
    const html = render();
    expect(html).toContain("Reveal phone number");
    expect(html).toContain("Reveal rider phone");
    expect(html).toContain("Resend current template");
    expect(html).toContain("Escalate to dispatch");
    expect(html).not.toContain("Cancel unpaid order");
    expect(html).not.toContain("Submit refund for approval");
  });
  it("offers cancellation only when no unresolved payment exists", () => {
    auth.permissions = ["orders.read", "orders.support"];
    expect(render({ ...detail, payment: null })).toContain("Cancel unpaid order");
    expect(render()).not.toContain("Cancel unpaid order");
  });
  it("makes refund initiation explicit and approval-only for finance staff", () => {
    auth.permissions = ["orders.read", "refunds.manage"];
    const html = render();
    expect(html).toContain("Initiate refund approval");
    expect(html).toContain("it does not send money");
    expect(html).toContain("Submit refund for approval");
  });
});
