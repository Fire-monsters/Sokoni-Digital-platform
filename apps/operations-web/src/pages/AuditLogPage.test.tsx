import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AuditEventDetail, AuditEventPage } from "@sokoni-digital/domain";
import { AuditLogPage } from "./AuditLogPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "test-token" }),
}));

const detail: AuditEventDetail = {
  id: "payment:10000000-0000-4000-8000-000000000001",
  actor: { staffId: "staff-id", name: "Finance Reviewer", role: "finance" },
  action: "payment.reconciled",
  entity: {
    type: "payment",
    id: "10000000-0000-4000-8000-000000000001",
    reference: "PAY-2026-001",
  },
  reason: "Provider status verified",
  operationId: "20000000-0000-4000-8000-000000000001",
  requestId: "api-request-001",
  context: { ip: "127.0.0.1", device: null, userAgent: "Operations browser" },
  occurredAt: "2026-09-24T10:00:00.000Z",
  previousState: { status: "pending" },
  newState: { status: "successful" },
  details: { result: "status_updated" },
};
const page: AuditEventPage = {
  data: [detail],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

describe("audit log page", () => {
  it("shows the complete immutable audit contract", () => {
    const html = renderToStaticMarkup(<AuditLogPage initialPage={page} initialDetail={detail} />);
    expect(html).toContain("Append-only ledger");
    expect(html).toContain("Finance Reviewer");
    expect(html).toContain("api-request-001");
    expect(html).toContain("Operations browser");
    expect(html).toContain("Previous state");
    expect(html).toContain("successful");
  });

  it("provides filters for cross-workflow investigations", () => {
    const html = renderToStaticMarkup(<AuditLogPage initialPage={page} />);
    expect(html).toContain("Reference, action or request ID");
    expect(html).toContain("payment.reconciled");
    expect(html).toContain('value="application"');
    expect(html).toContain('type="date"');
  });
});
