import type { DemoDB } from "@/models/types";
import { createSeed } from "@/mocks/fixtures";

const KEY = "sme-web:demo-db:v1";
const FAIL_KEY = "sme-web:simulate-failure";
let memory: DemoDB | null = null;

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function readDB(): DemoDB {
  if (memory) return memory;
  if (hasStorage()) {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoDB;
        if (parsed.version === 1) {
          const inventory = parsed.inventory.map((item) =>
            item.location ? item : { ...item, location: "Dry goods store" as const },
          );
          if (inventory.some((item, index) => item !== parsed.inventory[index])) {
            parsed.inventory = inventory;
            writeDB(parsed);
          }
          return (memory = parsed);
        }
      } catch {
        /* fall through to seed */
      }
    }
  }
  memory = createSeed();
  writeDB(memory);
  return memory;
}

export function writeDB(db: DemoDB) {
  memory = db;
  if (hasStorage()) localStorage.setItem(KEY, JSON.stringify(db));
}

export function resetDB() {
  memory = createSeed();
  writeDB(memory);
}

export const getSimulateFailure = () => hasStorage() && localStorage.getItem(FAIL_KEY) === "1";
export const setSimulateFailure = (on: boolean) => {
  if (!hasStorage()) return;
  if (on) localStorage.setItem(FAIL_KEY, "1");
  else localStorage.removeItem(FAIL_KEY);
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulates a network read. */
export async function query<T>(fn: (db: DemoDB) => T, ms = 300): Promise<T> {
  await wait(ms);
  if (getSimulateFailure())
    throw new Error("Service unavailable (simulated). Turn off failure simulation in Settings.");
  return structuredClone(fn(readDB()));
}

/** Simulates a network write applying a pure transition. */
export async function mutate<R>(
  fn: (db: DemoDB) => { db: DemoDB; result: R },
  ms = 350,
): Promise<R> {
  await wait(ms);
  if (getSimulateFailure()) throw new Error("Could not save (simulated outage). Try again later.");
  const { db, result } = fn(readDB());
  writeDB(db);
  return structuredClone(result);
}
