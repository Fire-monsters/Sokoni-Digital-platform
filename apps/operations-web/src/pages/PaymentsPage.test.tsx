import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsPage } from "./PaymentsPage";
const auth = vi.hoisted(() => ({ permissions: ["payments.read"] }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "test-token",
    can: (permission: string) => auth.permissions.includes(permission),
  }),
}));
describe("payment finance page", () => {
  beforeEach(() => {
    auth.permissions = ["payments.read"];
  });
  it("renders read-only access without a batch command", () => {
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain("Payment reconciliation");
    expect(html).not.toContain("Recheck pending batch");
    expect(html).toContain("Loading payments");
  });
  it("offers server-side batch reconciliation only to authorized staff", () => {
    auth.permissions.push("payments.reconcile");
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain("Recheck pending batch");
    expect(html).toContain("never accept a manually entered payment status");
  });
  it("provides a needs-review queue and reference search", () => {
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain('value="needs_review"');
    expect(html).toContain("Reference or phone");
    expect(html).not.toContain("Submit refund for approval");
  });
});
