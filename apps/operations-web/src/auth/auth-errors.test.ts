import { describe, expect, it } from "vitest";
import { staffSignInError } from "./auth-errors";
describe("staff sign-in errors", () => {
  it("does not expose Supabase's credential wording", () => {
    expect(staffSignInError("Invalid login credentials")).toBe(
      "The email or password is incorrect.",
    );
  });
  it("preserves actionable connection errors", () => {
    expect(staffSignInError("Failed to fetch")).toBe("Failed to fetch");
  });
});
