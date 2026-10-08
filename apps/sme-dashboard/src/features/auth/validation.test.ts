import { describe, expect, it } from "vitest";
import { credentialsSchema, phoneSchema, safeReturnTo } from "./validation";

describe("business auth validation", () => {
  it("normalizes Uganda local numbers and accepts the same prefixes as the API", () => {
    expect(phoneSchema.parse(" 0772 123 456 ")).toBe("+256772123456");
    expect(phoneSchema.parse("+256 312 123 456")).toBe("+256312123456");
    expect(phoneSchema.safeParse("+254772123456").success).toBe(false);
    expect(phoneSchema.safeParse("077212345").success).toBe(false);
  });
  it("enforces registration rules without blocking legacy login passwords", () => {
    const input = { phoneNumber: "0772123456", password: "short" };
    expect(credentialsSchema(true).safeParse(input).success).toBe(false);
    expect(credentialsSchema(false).safeParse(input).success).toBe(true);
    expect(credentialsSchema(true).safeParse({ ...input, password: "Produce123" }).success).toBe(
      true,
    );
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth/login",
    "/unknown",
    null,
  ])("rejects unsafe or unavailable destinations: %s", (value) => {
    expect(safeReturnTo(value)).toBe("/");
  });
  it("preserves filters and fragments for supported dashboard pages", () => {
    expect(safeReturnTo("/buy/orders?status=open#orders")).toBe("/buy/orders?status=open#orders");
  });
});
