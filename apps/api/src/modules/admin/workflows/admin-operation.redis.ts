import { randomUUID } from "node:crypto";
import { createClient } from "redis";

export interface CachedAdminOperation {
  actorStaffId: string;
  operationType: string;
  requestHash: string;
  outcome: "success" | "error";
  responseStatus: number;
  responseBody?: unknown;
  errorCode?: string;
  errorMessage?: string;
  currentVersion?: number;
}

export interface AdminOperationCoordinator {
  read(operationId: string): Promise<CachedAdminOperation | null>;
  acquire(operationId: string): Promise<string | null>;
  write(operationId: string, value: CachedAdminOperation): Promise<void>;
  release(operationId: string, token: string): Promise<void>;
  close(): Promise<void>;
}

const cachePrefix = "sokoni:admin-operation:result:";
const lockPrefix = "sokoni:admin-operation:lock:";
const resultTtlSeconds = 24 * 60 * 60;
const lockTtlMilliseconds = 30_000;

class NoopAdminOperationCoordinator implements AdminOperationCoordinator {
  read(): Promise<null> {
    return Promise.resolve(null);
  }
  acquire(): Promise<string> {
    return Promise.resolve(randomUUID());
  }
  write(): Promise<void> {
    return Promise.resolve();
  }
  release(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

class RedisAdminOperationCoordinator implements AdminOperationCoordinator {
  constructor(private readonly client: ReturnType<typeof createClient>) {}

  async read(operationId: string): Promise<CachedAdminOperation | null> {
    const value = await this.client.get(`${cachePrefix}${operationId}`);
    return value === null ? null : (JSON.parse(value) as CachedAdminOperation);
  }

  async acquire(operationId: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(`${lockPrefix}${operationId}`, token, {
      NX: true,
      PX: lockTtlMilliseconds,
    });
    return result === null ? null : token;
  }

  async write(operationId: string, value: CachedAdminOperation): Promise<void> {
    await this.client.set(`${cachePrefix}${operationId}`, JSON.stringify(value), {
      EX: resultTtlSeconds,
    });
  }

  async release(operationId: string, token: string): Promise<void> {
    await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [`${lockPrefix}${operationId}`], arguments: [token] },
    );
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

let coordinatorPromise: Promise<AdminOperationCoordinator> | undefined;

export function getAdminOperationCoordinator(): Promise<AdminOperationCoordinator> {
  coordinatorPromise ??= createCoordinator();
  return coordinatorPromise;
}

async function createCoordinator(): Promise<AdminOperationCoordinator> {
  const url = process.env.REDIS_URL;
  if (!url) return new NoopAdminOperationCoordinator();

  const client = createClient({
    url,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
  client.on("error", (error) => {
    console.warn("Redis admin-operation coordinator error", error);
  });
  try {
    await client.connect();
    return new RedisAdminOperationCoordinator(client);
  } catch (error) {
    console.warn("Redis unavailable; durable Postgres idempotency remains active", error);
    client.destroy();
    return new NoopAdminOperationCoordinator();
  }
}

export function resetAdminOperationCoordinatorForTests(): void {
  coordinatorPromise = undefined;
}

export async function closeAdminOperationCoordinator(): Promise<void> {
  if (!coordinatorPromise) return;
  const coordinator = await coordinatorPromise;
  await coordinator.close();
  coordinatorPromise = undefined;
}
