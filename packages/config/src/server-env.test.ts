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

  it("parses public workspace flags and configuration defaults", () => {
    const config = parseServerEnvironment(base);
    expect(config.PUBLIC_OPERATIONS_ENABLED).toBe(false);
    expect(config.PUBLIC_WAREHOUSE_ENABLED).toBe(false);
    expect(config.OPERATIONS_WORKSPACE_ACTOR_ID).toBeUndefined();
    expect(config.WAREHOUSE_WORKSPACE_ACTOR_ID).toBeUndefined();
    expect(config.WAREHOUSE_ID).toBeUndefined();
  });

  it("safely coerces boolean strings and parses valid actor/warehouse UUIDs", () => {
    const env = parseServerEnvironment({
      ...base,
      PUBLIC_OPERATIONS_ENABLED: "true",
      PUBLIC_WAREHOUSE_ENABLED: "false",
      OPERATIONS_WORKSPACE_ACTOR_ID: "11111111-1111-4111-8111-111111111111",
      WAREHOUSE_WORKSPACE_ACTOR_ID: "22222222-2222-4222-8222-222222222222",
      WAREHOUSE_ID: "33333333-3333-4333-8333-333333333333",
    });
    expect(env.PUBLIC_OPERATIONS_ENABLED).toBe(true);
    expect(env.PUBLIC_WAREHOUSE_ENABLED).toBe(false);
    expect(env.OPERATIONS_WORKSPACE_ACTOR_ID).toBe("11111111-1111-4111-8111-111111111111");
    expect(env.WAREHOUSE_WORKSPACE_ACTOR_ID).toBe("22222222-2222-4222-8222-222222222222");
    expect(env.WAREHOUSE_ID).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("rejects invalid boolean flag values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        parseServerEnvironment({
          ...base,
          PUBLIC_OPERATIONS_ENABLED: "invalid-flag",
        }),
      ).toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
