export type QueuedOperationStatus = "queued" | "running" | "failed";

export interface QueuedOperation<TPayload> {
  id: string;
  kind: string;
  payload: TPayload;
  attempts: number;
  nextAttemptAt: number;
  status: QueuedOperationStatus;
  lastError?: string;
}

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PendingListingImage {
  localId: string;
  originalUri: string;
  thumbnailUri: string;
  originalByteSize: number;
  thumbnailByteSize: number;
  status: "prepared" | "uploading" | "failed" | "complete";
}

export function retryDelay(attempt: number, baseDelayMs = 1_000, maxDelayMs = 60_000): number {
  return Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs);
}

export class PersistentOperationQueue<TPayload> {
  private operations: QueuedOperation<TPayload>[] = [];

  constructor(
    private readonly storage: QueueStorage,
    private readonly storageKey: string,
  ) {}

  async hydrate(): Promise<QueuedOperation<TPayload>[]> {
    const stored = await this.storage.getItem(this.storageKey);
    this.operations = stored ? (JSON.parse(stored) as QueuedOperation<TPayload>[]) : [];
    return this.snapshot();
  }

  async enqueue(
    operation: Omit<QueuedOperation<TPayload>, "attempts" | "nextAttemptAt" | "status">,
  ) {
    const existing = this.operations.find((candidate) => candidate.id === operation.id);
    if (existing) return existing;

    const queued: QueuedOperation<TPayload> = {
      ...operation,
      attempts: 0,
      nextAttemptAt: Date.now(),
      status: "queued",
    };
    this.operations.push(queued);
    await this.persist();
    return queued;
  }

  async flush(execute: (operation: QueuedOperation<TPayload>) => Promise<void>, now = Date.now()) {
    for (const operation of [...this.operations]) {
      if (operation.nextAttemptAt > now || operation.status === "running") continue;
      operation.status = "running";

      try {
        await execute(operation);
        this.operations = this.operations.filter((candidate) => candidate.id !== operation.id);
      } catch (error) {
        operation.attempts += 1;
        operation.status = "failed";
        operation.lastError = error instanceof Error ? error.message : "Operation failed";
        operation.nextAttemptAt = now + retryDelay(operation.attempts);
      }
      await this.persist();
    }

    return this.snapshot();
  }

  snapshot(): QueuedOperation<TPayload>[] {
    return this.operations.map((operation) => ({ ...operation }));
  }

  private persist() {
    return this.storage.setItem(this.storageKey, JSON.stringify(this.operations));
  }
}
