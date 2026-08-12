import { isAssignmentCacheFresh, type RiderCurrentDelivery } from "@sokoni-digital/domain";
import * as SQLite from "expo-sqlite";

const databasePromise = SQLite.openDatabaseAsync("rider-operations.db");
let initialized: Promise<void> | undefined;

async function database() {
  const db = await databasePromise;
  initialized ??= db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS active_assignment (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      saved_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_delivery_operations (
      operation_id TEXT PRIMARY KEY NOT NULL,
      delivery_id TEXT NOT NULL,
      to_status TEXT NOT NULL,
      expected_version INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_proof_uploads (
      operation_id TEXT PRIMARY KEY NOT NULL,
      delivery_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await initialized;
  return db;
}

export async function saveAssignment(assignment: RiderCurrentDelivery): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO active_assignment (cache_key, payload, saved_at) VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`,
    "current",
    JSON.stringify(assignment),
    new Date().toISOString(),
  );
}

export async function loadAssignment(): Promise<RiderCurrentDelivery | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string; saved_at: string }>(
    "SELECT payload, saved_at FROM active_assignment WHERE cache_key = ?",
    "current",
  );
  if (!row) return null;
  if (!isAssignmentCacheFresh(row.saved_at)) {
    await clearAssignment();
    return null;
  }
  try {
    const parsed = JSON.parse(row.payload) as RiderCurrentDelivery;
    return {
      ...parsed,
      completion: parsed.completion ?? { consumerConfirmed: false, readyProofImageCount: 0 },
    };
  } catch {
    await clearAssignment();
    return null;
  }
}

export async function clearAssignment(): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM active_assignment WHERE cache_key = ?", "current");
}

export interface QueuedDeliveryOperation {
  operationId: string;
  deliveryId: string;
  toStatus: "arrived_at_market" | "in_transit";
  expectedVersion: number;
}

export interface QueuedProofUpload<T = unknown> {
  operationId: string;
  deliveryId: string;
  payload: T;
}

export async function queueProofUpload<T>(upload: QueuedProofUpload<T>): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT INTO pending_proof_uploads (operation_id, delivery_id, payload, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(operation_id) DO UPDATE SET payload = excluded.payload`,
    upload.operationId,
    upload.deliveryId,
    JSON.stringify(upload.payload),
    new Date().toISOString(),
  );
}

export async function listQueuedProofUploads<T>(): Promise<QueuedProofUpload<T>[]> {
  const db = await database();
  const rows = await db.getAllAsync<{ operation_id: string; delivery_id: string; payload: string }>(
    "SELECT operation_id, delivery_id, payload FROM pending_proof_uploads ORDER BY created_at, operation_id",
  );
  const uploads: QueuedProofUpload<T>[] = [];
  for (const row of rows) {
    try {
      uploads.push({
        operationId: row.operation_id,
        deliveryId: row.delivery_id,
        payload: JSON.parse(row.payload) as T,
      });
    } catch {
      await removeQueuedProofUpload(row.operation_id);
    }
  }
  return uploads;
}

export async function removeQueuedProofUpload(operationId: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM pending_proof_uploads WHERE operation_id = ?", operationId);
}

export async function queueDeliveryOperation(operation: QueuedDeliveryOperation): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT OR IGNORE INTO pending_delivery_operations
      (operation_id, delivery_id, to_status, expected_version, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    operation.operationId,
    operation.deliveryId,
    operation.toStatus,
    operation.expectedVersion,
    new Date().toISOString(),
  );
}

export async function listQueuedDeliveryOperations(): Promise<QueuedDeliveryOperation[]> {
  const db = await database();
  const rows = await db.getAllAsync<{
    operation_id: string;
    delivery_id: string;
    to_status: QueuedDeliveryOperation["toStatus"];
    expected_version: number;
  }>(`SELECT operation_id, delivery_id, to_status, expected_version
      FROM pending_delivery_operations ORDER BY created_at, operation_id`);
  return rows.map((row) => ({
    operationId: row.operation_id,
    deliveryId: row.delivery_id,
    toStatus: row.to_status,
    expectedVersion: row.expected_version,
  }));
}

export async function removeQueuedDeliveryOperation(operationId: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM pending_delivery_operations WHERE operation_id = ?", operationId);
}
