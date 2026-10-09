import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentsPage } from "./PaymentsPage";
describe("payment finance page", () => {
  it("renders without authentication and exposes simulated batch actions", () => {
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain("Payment reconciliation");
    expect(html).toContain("Recheck pending batch");
    expect(html).toContain("Loading payments");
  });
  it("labels provider operations as simulated", () => {
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain("Recheck pending batch");
    expect(html).toContain("No provider is contacted");
  });
  it("provides a needs-review queue and reference search", () => {
    const html = renderToStaticMarkup(<PaymentsPage />);
    expect(html).toContain('value="needs_review"');
    expect(html).toContain("Reference or phone");
    expect(html).not.toContain("Submit refund for approval");
  });
});
