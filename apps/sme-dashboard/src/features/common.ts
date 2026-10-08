export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const PLATFORM_COMMISSION_RATE = 0.05;
export const DELIVERY_FEE = 25000;

export function nextId(prefix: string, existing: string[], start = 1000) {
  const nums = existing.map((id) => Number(id.split("-").pop())).filter((x) => !Number.isNaN(x));
  const next = (nums.length ? Math.max(...nums) : start) + 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

export function uid(prefix = "M") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
