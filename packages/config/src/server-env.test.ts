import { describe, expect, it, vi } from "vitest";
import { parseServerEnvironment } from "./server-env.js";
const base = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SUPABASE_SECRET_KEY: "secret-test",
};
describe("deployment modes", () => {
  it("allows wholesale production without Pesapal", () => {
    expect(
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_MODE: "wholesale",
        PAYMENTS_ENV: "disabled",
      }).APP_MODE,
    ).toBe("wholesale");
  });
  it("preserves the full development default", () => {
    expect(parseServerEnvironment(base).APP_MODE).toBe("full");
  });
  it.each([
    { NODE_ENV: "production", APP_MODE: "full", PAYMENTS_ENV: "fake" },
    { APP_MODE: "full", PAYMENTS_ENV: "disabled" },
    { APP_MODE: "wholesale", PAYMENTS_ENV: "fake" },
    { APP_MODE: "full", PAYMENTS_ENV: "production" },
  ])("rejects an unsafe or incomplete combination: %o", (settings) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => parseServerEnvironment({ ...base, ...settings })).toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
