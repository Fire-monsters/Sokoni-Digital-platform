import { z } from "zod";

// Match the business-auth contract; mobile /v1/auth endpoints are unrelated.
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .transform((value) => (value.startsWith("0") ? `+256${value.slice(1)}` : value))
  .pipe(
    z
      .string()
      .regex(/^\+256(?:7[0-9]|3[0-9])[0-9]{7}$/, "Enter a Ugandan number, e.g. 0772 123 456."),
  );

export const credentialsSchema = (register: boolean) =>
  z.object({
    phoneNumber: phoneSchema,
    password: register
      ? z
          .string()
          .min(8, "Use at least 8 characters.")
          .max(128, "Use at most 128 characters.")
          .regex(/[A-Z]/, "Include an uppercase letter.")
          .regex(/[a-z]/, "Include a lowercase letter.")
          .regex(/[0-9]/, "Include a number.")
      : z.string().min(1, "Enter your password.").max(128, "Use at most 128 characters."),
  });

const dashboardPaths = new Set([
  "/",
  "/inventory",
  "/finance",
  "/reports",
  "/settings",
  "/buy/catalogue",
  "/buy/orders",
  "/sell/listings",
  "/sell/orders",
]);

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/";
  const url = new URL(value, "https://dashboard.invalid");
  return dashboardPaths.has(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : "/";
}

export const authSearch = (search: Record<string, unknown>) => ({
  redirect: safeReturnTo(search.redirect),
});
