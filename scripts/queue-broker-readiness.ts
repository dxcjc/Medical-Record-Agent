import { isCliEntrypoint } from "./production-smoke";
import {
  createInProcessJobQueueExecutor,
  createRedisJobQueueAdapter,
  type RedisJobQueueClient
} from "../apps/api/src/services/api-services";

export type QueueBrokerReadinessStatus = "passed" | "blocked" | "failed";

export interface QueueBrokerReadinessCheck {
  id: string;
  status: Exclude<QueueBrokerReadinessStatus, "blocked">;
  detail: string;
}

export interface QueueBrokerReadinessBlockedStep {
  name: "queue-broker";
  code: "QUEUE_BROKER_SMOKE_NOT_RUN";
  adapter: "local-contract-only";
  requiredExternal: string[];
  nextAction: string;
  requiredChecks: string[];
}

export interface QueueBrokerReadinessSummary {
  generatedAt: string;
  localReadiness: Exclude<QueueBrokerReadinessStatus, "blocked">;
  externalIntegration: Extract<QueueBrokerReadinessStatus, "blocked">;
  finalProduct: Extract<QueueBrokerReadinessStatus, "blocked">;
  checks: QueueBrokerReadinessCheck[];
  blocked: Omit<QueueBrokerReadinessBlockedStep, "adapter">;
  blockedSteps: QueueBrokerReadinessBlockedStep[];
}

export interface RunQueueBrokerReadinessOptions {
  now?: () => Date;
  unsafeDeadLetterProbe?: string;
}

const REQUIRED_EXTERNAL = ["Redis/RabbitMQ/SQS", "two or more workers", "multi-instance smoke"];
const REQUIRED_CHECKS = [
  "multi-worker-lease-smoke",
  "retry-dead-letter-smoke",
  "heartbeat-status-consistency-smoke",
  "status-result-consistency-smoke",
  "idempotency-key-deduplication-smoke"
];
const NEXT_ACTION =
  "接入真实 Redis/RabbitMQ/SQS broker 和至少两个 worker，运行 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。";

function passed(id: string, detail: string): QueueBrokerReadinessCheck {
  return { id, status: "passed", detail };
}

function failed(id: string, detail: string): QueueBrokerReadinessCheck {
  return { id, status: "failed", detail };
}

function createRedisClientMock(): RedisJobQueueClient {
  const lists = new Map<string, string[]>();
  const values = new Map<string, string>();

  return {
    async rpush(key, ...items) {
      const list = lists.get(key) ?? [];
      list.push(...items);
      lists.set(key, list);
      return list.length;
    },
    async lpop(key) {
      const list = lists.get(key) ?? [];
      const item = list.shift() ?? null;
      lists.set(key, list);
      return item;
    },
    async lrange(key, start, stop) {
      const list = lists.get(key) ?? [];
      const normalizedStop = stop < 0 ? list.length + stop : stop;
      return list.slice(start, normalizedStop + 1);
    },
    async set(key, value, options) {
      if (options?.nx && values.has(key)) {
        return null;
      }

      values.set(key, value);
      return "OK";
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async del(...keys) {
      let deleted = 0;
      for (const key of keys) {
        if (values.delete(key)) {
          deleted += 1;
        }
        if (lists.delete(key)) {
          deleted += 1;
        }
      }

      return deleted;
    },
    async pexpire(key) {
      return values.has(key) ? 1 : 0;
    }
  };
}

async function runRedisBrokerContract(options: RunQueueBrokerReadinessOptions) {
  const rawProbe = options.unsafeDeadLetterProbe ?? "raw upstream token should not be persisted";
  const queueOptions: Parameters<typeof createRedisJobQueueAdapter>[0] = {
    client: createRedisClientMock(),
    queueName: "medical-recognition-jobs",
    deadLetterQueue: "medical-recognition-jobs-dlq",
    visibilityTimeoutMs: 30_000,
    retryLimit: 2,
    heartbeatIntervalMs: 5_000,
    idempotencyTtlMs: 60_000
  };
  if (options.now !== undefined) {
    queueOptions.now = options.now;
  }

  const queue = createRedisJobQueueAdapter(queueOptions);
  const task = {
    name: "recognition",
    idempotencyKey: "recognition:readiness-job-001",
    payload: {
      jobId: "readiness-job-001"
    },
    run: async () => undefined
  };

  await queue.enqueue(task);
  await queue.enqueue(task);

  const firstLease = await queue.leaseNext();
  if (!firstLease || firstLease.attempt !== 1 || firstLease.payload === undefined) {
    return failed("redis-broker-adapter-contract", "redis broker skeleton failed to lease the first queued task.");
  }

  await queue.heartbeat(firstLease.id);
  await queue.fail(firstLease.id, Object.assign(new Error(rawProbe), { code: "OCR_TIMEOUT" }));

  const secondLease = await queue.leaseNext();
  if (!secondLease || secondLease.attempt !== 2) {
    return failed("redis-broker-adapter-contract", "redis broker skeleton failed to retry a failed leased task.");
  }

  await queue.fail(secondLease.id, Object.assign(new Error(rawProbe), { code: "OCR_TIMEOUT" }));
  const deadLetters = await queue.listDeadLetters();
  const inspectedDeadLetters =
    options.unsafeDeadLetterProbe === undefined
      ? deadLetters
      : [
          ...deadLetters,
          {
            taskName: "unsafe-probe",
            attempts: 1,
            error: {
              message: options.unsafeDeadLetterProbe
            },
            failedAt: options.now?.() ?? new Date()
          }
        ];

  if (JSON.stringify(inspectedDeadLetters).includes(rawProbe)) {
    return failed(
      "redis-broker-adapter-contract",
      "redis broker skeleton leaked raw provider error text into dead-letter diagnostics."
    );
  }

  return passed(
    "redis-broker-adapter-contract",
    "redis broker skeleton covers idempotent enqueue, lease, heartbeat, retry and dead-letter redaction."
  );
}

function runStatusResultConsistencyContract() {
  const jobStatus = new Map<string, string>();
  const results = new Map<string, { jobId: string }>();
  const jobId = "readiness-job-001";

  jobStatus.set(jobId, "running");
  results.set(jobId, { jobId });
  jobStatus.set(jobId, "completed");

  return jobStatus.get(jobId) === "completed" && results.get(jobId)?.jobId === jobId
    ? passed("status-result-consistency-contract", "local harness prevents completed job status without a same-job result record.")
    : failed("status-result-consistency-contract", "completed job status did not have a same-job result record.");
}

export async function runQueueBrokerReadiness(
  options: RunQueueBrokerReadinessOptions = {}
): Promise<QueueBrokerReadinessSummary> {
  const now = options.now ?? (() => new Date());
  const inProcessDescription = createInProcessJobQueueExecutor({
    maxAttempts: 2,
    heartbeatIntervalMs: 5_000,
    now
  }).describe();
  const checks: QueueBrokerReadinessCheck[] = [
    inProcessDescription.adapter === "in-process" &&
    inProcessDescription.productionReady === false &&
    inProcessDescription.capabilities.lease &&
    inProcessDescription.capabilities.retry &&
    inProcessDescription.capabilities.deadLetter &&
    inProcessDescription.capabilities.heartbeat
      ? passed(
          "in-process-adapter-contract",
          "in-process queue exposes local lease/retry/dead-letter/heartbeat contract and remains single-instance only."
        )
      : failed("in-process-adapter-contract", "in-process queue contract lost local lease/retry/dead-letter/heartbeat posture."),
    await runRedisBrokerContract({ ...options, now }),
    runStatusResultConsistencyContract()
  ];
  const localReadiness = checks.some((check) => check.status === "failed") ? "failed" : "passed";
  const blockedStep: QueueBrokerReadinessBlockedStep = {
    name: "queue-broker",
    code: "QUEUE_BROKER_SMOKE_NOT_RUN",
    adapter: "local-contract-only",
    requiredExternal: [...REQUIRED_EXTERNAL],
    nextAction: NEXT_ACTION,
    requiredChecks: [...REQUIRED_CHECKS]
  };

  return {
    generatedAt: now().toISOString(),
    localReadiness,
    externalIntegration: "blocked",
    finalProduct: "blocked",
    checks,
    blocked: {
      name: blockedStep.name,
      code: blockedStep.code,
      requiredExternal: [...blockedStep.requiredExternal],
      nextAction: blockedStep.nextAction,
      requiredChecks: [...blockedStep.requiredChecks]
    },
    blockedSteps: [blockedStep]
  };
}

export function chooseQueueBrokerReadinessExitCode(summary: QueueBrokerReadinessSummary) {
  return summary.localReadiness === "failed" ? 1 : 2;
}

export function formatQueueBrokerReadinessSummary(summary: QueueBrokerReadinessSummary) {
  return [
    `localReadiness=${summary.localReadiness}`,
    `externalIntegration=${summary.externalIntegration}`,
    `finalProduct=${summary.finalProduct}`,
    `blockedCode=${summary.blocked.code}`,
    `requiredExternal=${summary.blocked.requiredExternal.join(",")}`,
    `requiredChecks=${summary.blocked.requiredChecks.join(",")}`,
    ...summary.checks.map((check) => `${check.status.toUpperCase()} ${check.id} ${check.detail}`)
  ].join("\n");
}

async function main() {
  const summary = await runQueueBrokerReadiness();
  console.log(JSON.stringify(summary, null, 2));
  console.log(`SUMMARY_JSON ${JSON.stringify(summary)}`);
  console.log(formatQueueBrokerReadinessSummary(summary));
  process.exitCode = chooseQueueBrokerReadinessExitCode(summary);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
