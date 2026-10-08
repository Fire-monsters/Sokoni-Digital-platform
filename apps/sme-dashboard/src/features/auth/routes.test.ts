import { describe, expect, it } from "vitest";
import { getRouter } from "../../router";
import { authDestination } from "../../lib/auth-navigation";

describe("auth routing", () => {
  it("registers all auth screens in the generated route tree", () => {
    const router = getRouter();
    for (const path of ["/auth/login", "/auth/register", "/auth/verify"] as const) {
      expect(router.routesByPath[path]).toBeDefined();
    }
  });
  it("returns to a filtered page with the query and fragment parsed as location parts", () => {
    const router = getRouter();
    const location = router.buildLocation(authDestination("/buy/orders?status=open#orders"));
    expect(location.pathname).toBe("/buy/orders");
    expect(location.search).toEqual({ status: "open" });
    expect(location.hash).toBe("orders");
  });
});
