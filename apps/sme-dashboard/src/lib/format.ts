const ugxFmt = new Intl.NumberFormat("en-UG", {
  style: "currency",
  currency: "UGX",
  maximumFractionDigits: 0,
});
export const ugx = (n: number) => ugxFmt.format(Math.round(n));
export const num = (n: number) => n.toLocaleString("en-UG", { maximumFractionDigits: 1 });
export const eat = (iso: string) =>
  new Intl.DateTimeFormat("en-UG", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso)) + " EAT";
export const eatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium" }).format(
    new Date(iso),
  );
export const qty = (n: number, unit: string) =>
  `${num(n)} ${unit === "kg" ? "kg" : n === 1 ? unit : unit + "s"}`;
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const paymentLabel: Record<string, string> = {
  mobile_money: "Mobile Money",
  bank_transfer: "Bank transfer",
  trade_credit: "Trade credit",
};
