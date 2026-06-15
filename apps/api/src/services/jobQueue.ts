import type { Prisma } from "@prisma/client";

export interface JobQueueTask {
  name: string;
  run: () => Promise<void>;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
}

export interface JobQueueDescription {
  adapter: string;
  brokerProvider?: string;
  productionReady: boolean;
  blockedReason?: string;
  capabilities: {
    durable: boolean;
    multiInstance: boolean;
    lease: boolean;
    retry: boolean;
    deadLetter: boolean;
    heartbeat: boolean;
  };
  policy: {
    maxAttempts: number;
    heartbeatIntervalMs: number;
    maxConcurrent?: number;
  };
  readiness: {
    nextAction: string;
    requiredChecks: string[];
  };
}

export interface JobQueueLease {
  id: string;
  taskName: string;
  attempt: number;
  leasedAt: Date;
  heartbeatAt: Date;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
}

export interface JobQueueDeadLetter {
  taskName: string;
  attempts: number;
  error: Prisma.InputJsonValue;
  failedAt: Date;
}

export interface JobQueueAdapter {
  enqueue(task: (() => Promise<void>) | JobQueueTask): void | Promise<void>;
  drain(): Promise<void>;
  describe(): JobQueueDescription;
  leaseNext?(): Promise<JobQueueLease | null>;
  complete?(leaseId: string): Promise<void>;
  fail?(leaseId: string, error: unknown): Promise<void>;
  heartbeat?(leaseId: string): Promise<void>;
  listDeadLetters?(): Promise<JobQueueDeadLetter[]>;
}

export type ApiJobQueueExecutor = JobQueueAdapter;

export interface RedisJobQueueClient {
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
}

export interface RedisJobQueueAdapterOptions {
  client: RedisJobQueueClient;
  queueName: string;
  deadLetterQueue: string;
  visibilityTimeoutMs: number;
  retryLimit: number;
  heartbeatIntervalMs?: number;
  idempotencyTtlMs?: number;
  now?: () => Date;
}

export interface RedisJobQueueAdapter extends JobQueueAdapter {
  leaseNext(): Promise<JobQueueLease | null>;
  complete(leaseId: string): Promise<void>;
  fail(leaseId: string, error: unknown): Promise<void>;
  heartbeat(leaseId: string): Promise<void>;
  listDeadLetters(): Promise<JobQueueDeadLetter[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeJobExecutionError(error: unknown): Prisma.InputJsonValue {
  const code =
    isRecord(error) && typeof error.code === "string" && error.code.length > 0
      ? error.code
      : "JOB_EXECUTION_FAILED";

  return {
    code,
    message: "识别后台任务执行失败，请查看服务端安全日志或 provider 诊断。"
  };
}

export const inProcessJobQueueReadiness = {
  nextAction:
    "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
  requiredChecks: [
    "multi-worker-lease-smoke",
    "retry-dead-letter-smoke",
    "heartbeat-status-consistency-smoke",
    "status-result-consistency-smoke",
    "idempotency-key-deduplication-smoke"
  ]
};

export const brokerJobQueueReadiness = {
  nextAction:
    "完成真实 Redis/RabbitMQ/SQS worker 绑定，并运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
  requiredChecks: [
    "multi-worker-lease-smoke",
    "retry-dead-letter-smoke",
    "heartbeat-status-consistency-smoke",
    "status-result-consistency-smoke",
    "idempotency-key-deduplication-smoke"
  ]
};

export function createInProcessJobQueueExecutor(
  options: {
    maxAttempts?: number;
    heartbeatIntervalMs?: number;
    now?: () => Date;
  } = {}
): ApiJobQueueExecutor {
  const pending = new Set<Promise<void>>();
  const leases = new Map<string, JobQueueLease>();
  const deadLetters: JobQueueDeadLetter[] = [];
  const maxAttempts = options.maxAttempts ?? 1;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  const now = options.now ?? (() => new Date());
  const maxConcurrent = Number(process.env.MAX_CONCURRENT_JOBS ?? "3") || 3;
  let sequence = 0;
  let runningJobs = 0;
  const waitingQueue: Array<() => void> = [];

  function normalizeTask(task: (() => Promise<void>) | JobQueueTask): JobQueueTask {
    if (typeof task === "function") {
      return { name: "anonymous", run: task };
    }
    return task;
  }

  return {
    enqueue(task) {
      const queueTask = normalizeTask(task);
      const leaseId = `in-process-${++sequence}`;

      const promise = new Promise<void>((resolve) => {
        function acquireSlot() {
          if (runningJobs < maxConcurrent) {
            runningJobs += 1;
            resolve();
          } else {
            waitingQueue.push(acquireSlot);
          }
        }
        acquireSlot();
      })
        .then(async () => {
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const lease = {
              id: leaseId,
              taskName: queueTask.name,
              attempt,
              leasedAt: now(),
              heartbeatAt: now()
            };
            leases.set(leaseId, lease);

            try {
              await queueTask.run();
              return;
            } catch (error) {
              if (attempt >= maxAttempts) {
                deadLetters.push({
                  taskName: queueTask.name,
                  attempts: attempt,
                  error: sanitizeJobExecutionError(error),
                  failedAt: now()
                });
                throw error;
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          leases.delete(leaseId);
          pending.delete(promise);
          runningJobs -= 1;
          const next = waitingQueue.shift();
          if (next) next();
        });

      pending.add(promise);
    },
    async drain() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
    describe() {
      return {
        adapter: "in-process",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_NOT_CONFIGURED",
        capabilities: {
          durable: false,
          multiInstance: false,
          lease: true,
          retry: true,
          deadLetter: true,
          heartbeat: true
        },
        policy: {
          maxAttempts,
          heartbeatIntervalMs,
          maxConcurrent
        },
        readiness: inProcessJobQueueReadiness
      };
    },
    async heartbeat(leaseId) {
      const lease = leases.get(leaseId);
      if (lease) {
        leases.set(leaseId, { ...lease, heartbeatAt: now() });
      }
    },
    async listDeadLetters() {
      return [...deadLetters];
    }
  };
}

type RedisQueuedTaskEnvelope = {
  id: string;
  taskName: string;
  attempt: number;
  enqueuedAt: string;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
};

type RedisLeaseEnvelope = RedisQueuedTaskEnvelope & {
  leaseId: string;
  leasedAt: string;
  heartbeatAt: string;
};

function parseRedisQueuedTaskEnvelope(value: string): RedisQueuedTaskEnvelope | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.taskName !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      taskName: parsed.taskName,
      attempt: typeof parsed.attempt === "number" && Number.isFinite(parsed.attempt) ? parsed.attempt : 0,
      enqueuedAt: typeof parsed.enqueuedAt === "string" ? parsed.enqueuedAt : new Date(0).toISOString(),
      ...(typeof parsed.idempotencyKey === "string" ? { idempotencyKey: parsed.idempotencyKey } : {}),
      ...(parsed.payload !== undefined ? { payload: parsed.payload as Prisma.InputJsonValue } : {})
    };
  } catch {
    return null;
  }
}

function parseRedisLeaseEnvelope(value: string): RedisLeaseEnvelope | null {
  const queued = parseRedisQueuedTaskEnvelope(value);
  if (!queued) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.leaseId !== "string") return null;
    return {
      ...queued,
      leaseId: parsed.leaseId,
      leasedAt: typeof parsed.leasedAt === "string" ? parsed.leasedAt : new Date(0).toISOString(),
      heartbeatAt: typeof parsed.heartbeatAt === "string" ? parsed.heartbeatAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}

function toRedisQueueLease(envelope: RedisLeaseEnvelope): JobQueueLease {
  return {
    id: envelope.leaseId,
    taskName: envelope.taskName,
    attempt: envelope.attempt,
    leasedAt: new Date(envelope.leasedAt),
    heartbeatAt: new Date(envelope.heartbeatAt),
    ...(envelope.idempotencyKey !== undefined ? { idempotencyKey: envelope.idempotencyKey } : {}),
    ...(envelope.payload !== undefined ? { payload: envelope.payload } : {})
  };
}

function toRedisDeadLetter(value: string): JobQueueDeadLetter | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.taskName !== "string") return null;
    const failedAt = typeof parsed.failedAt === "string" ? new Date(parsed.failedAt) : new Date(0);
    return {
      taskName: parsed.taskName,
      attempts: typeof parsed.attempts === "number" && Number.isFinite(parsed.attempts) ? parsed.attempts : 0,
      error: (parsed.error ?? {}) as Prisma.InputJsonValue,
      failedAt
    };
  } catch {
    return null;
  }
}

export function createRedisJobQueueAdapter(options: RedisJobQueueAdapterOptions): RedisJobQueueAdapter {
  const now = options.now ?? (() => new Date());
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(1000, Math.floor(options.visibilityTimeoutMs / 2));
  const idempotencyTtlMs = options.idempotencyTtlMs ?? options.visibilityTimeoutMs * Math.max(1, options.retryLimit);
  let sequence = 0;

  function leaseKey(leaseId: string) { return `${options.queueName}:lease:${leaseId}`; }
  function idempotencyKey(key: string) { return `${options.queueName}:idem:${key}`; }

  function normalizeTask(task: (() => Promise<void>) | JobQueueTask): JobQueueTask {
    if (typeof task === "function") return { name: "anonymous", run: task };
    return task;
  }

  function serializeEnvelope(envelope: RedisQueuedTaskEnvelope | RedisLeaseEnvelope) {
    return JSON.stringify(envelope);
  }

  return {
    async enqueue(task) {
      const queueTask = normalizeTask(task);
      const enqueuedAt = now().toISOString();
      const envelope: RedisQueuedTaskEnvelope = {
        id: `redis-task-${++sequence}`,
        taskName: queueTask.name,
        attempt: 0,
        enqueuedAt,
        ...(queueTask.idempotencyKey !== undefined ? { idempotencyKey: queueTask.idempotencyKey } : {}),
        ...(queueTask.payload !== undefined ? { payload: queueTask.payload } : {})
      };
      if (queueTask.idempotencyKey !== undefined) {
        const reserved = await options.client.set(idempotencyKey(queueTask.idempotencyKey), serializeEnvelope(envelope), {
          nx: true,
          px: idempotencyTtlMs
        });
        if (reserved !== "OK") return;
      }
      await options.client.rpush(options.queueName, serializeEnvelope(envelope));
    },
    async drain() { return undefined; },
    describe() {
      return {
        adapter: "broker",
        brokerProvider: "redis",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_SMOKE_NOT_RUN",
        capabilities: { durable: true, multiInstance: true, lease: true, retry: true, deadLetter: true, heartbeat: true },
        policy: { maxAttempts: options.retryLimit, heartbeatIntervalMs },
        readiness: brokerJobQueueReadiness
      };
    },
    async leaseNext() {
      const raw = await options.client.lpop(options.queueName);
      if (!raw) return null;
      const queued = parseRedisQueuedTaskEnvelope(raw);
      if (!queued) return null;
      const leaseId = `${queued.id}:attempt-${queued.attempt + 1}`;
      const leasedAt = now().toISOString();
      const leaseEnvelope: RedisLeaseEnvelope = {
        ...queued, attempt: queued.attempt + 1, leaseId, leasedAt, heartbeatAt: leasedAt
      };
      await options.client.set(leaseKey(leaseId), serializeEnvelope(leaseEnvelope), { px: options.visibilityTimeoutMs });
      return toRedisQueueLease(leaseEnvelope);
    },
    async complete(leaseId) { await options.client.del(leaseKey(leaseId)); },
    async fail(leaseId, error) {
      const raw = await options.client.get(leaseKey(leaseId));
      const lease = raw ? parseRedisLeaseEnvelope(raw) : null;
      if (!lease) return;
      if (lease.attempt >= options.retryLimit) {
        await options.client.rpush(options.deadLetterQueue, JSON.stringify({
          taskName: lease.taskName, attempts: lease.attempt,
          error: sanitizeJobExecutionError(error), failedAt: now().toISOString()
        }));
        await options.client.del(leaseKey(leaseId));
        return;
      }
      const retryEnvelope: RedisQueuedTaskEnvelope = {
        id: lease.id, taskName: lease.taskName, attempt: lease.attempt,
        enqueuedAt: now().toISOString(),
        ...(lease.idempotencyKey !== undefined ? { idempotencyKey: lease.idempotencyKey } : {}),
        ...(lease.payload !== undefined ? { payload: lease.payload } : {})
      };
      await options.client.rpush(options.queueName, serializeEnvelope(retryEnvelope));
      await options.client.del(leaseKey(leaseId));
    },
    async heartbeat(leaseId) { await options.client.pexpire(leaseKey(leaseId), options.visibilityTimeoutMs); },
    async listDeadLetters() {
      const rows = await options.client.lrange(options.deadLetterQueue, 0, -1);
      return rows.flatMap((row) => { const item = toRedisDeadLetter(row); return item ? [item] : []; });
    }
  };
}

export { sanitizeJobExecutionError };
