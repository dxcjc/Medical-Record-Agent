import { describe, expect, it } from "vitest";

import {
  chooseQueueBrokerReadinessExitCode,
  formatQueueBrokerReadinessSummary,
  runQueueBrokerReadiness
} from "./queue-broker-readiness";

describe("queue broker readiness script", () => {
  it("passes local queue contracts while keeping real multi-instance broker smoke blocked", async () => {
    const summary = await runQueueBrokerReadiness({
      now: () => new Date("2026-06-10T01:30:00.000Z")
    });

    expect(summary.localReadiness).toBe("passed");
    expect(summary.externalIntegration).toBe("blocked");
    expect(summary.finalProduct).toBe("blocked");
    expect(summary.checks).toEqual([
      {
        id: "in-process-adapter-contract",
        status: "passed",
        detail: "in-process queue exposes local lease/retry/dead-letter/heartbeat contract and remains single-instance only."
      },
      {
        id: "redis-broker-adapter-contract",
        status: "passed",
        detail: "redis broker skeleton covers idempotent enqueue, lease, heartbeat, retry and dead-letter redaction."
      },
      {
        id: "status-result-consistency-contract",
        status: "passed",
        detail: "local harness prevents completed job status without a same-job result record."
      }
    ]);
    expect(summary.blocked).toEqual({
      name: "queue-broker",
      code: "QUEUE_BROKER_SMOKE_NOT_RUN",
      requiredExternal: ["Redis/RabbitMQ/SQS", "two or more workers", "multi-instance smoke"],
      nextAction:
        "接入真实 Redis/RabbitMQ/SQS broker 和至少两个 worker，运行 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
      requiredChecks: [
        "multi-worker-lease-smoke",
        "retry-dead-letter-smoke",
        "heartbeat-status-consistency-smoke",
        "status-result-consistency-smoke",
        "idempotency-key-deduplication-smoke"
      ]
    });
    expect(summary.blockedSteps).toEqual([
      {
        name: "queue-broker",
        code: "QUEUE_BROKER_SMOKE_NOT_RUN",
        adapter: "local-contract-only",
        requiredExternal: ["Redis/RabbitMQ/SQS", "two or more workers", "multi-instance smoke"],
        nextAction:
          "接入真实 Redis/RabbitMQ/SQS broker 和至少两个 worker，运行 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
        requiredChecks: [
          "multi-worker-lease-smoke",
          "retry-dead-letter-smoke",
          "heartbeat-status-consistency-smoke",
          "status-result-consistency-smoke",
          "idempotency-key-deduplication-smoke"
        ]
      }
    ]);
    expect(chooseQueueBrokerReadinessExitCode(summary)).toBe(2);
    expect(formatQueueBrokerReadinessSummary(summary)).toContain("localReadiness=passed");
    expect(formatQueueBrokerReadinessSummary(summary)).toContain("externalIntegration=blocked");
    expect(formatQueueBrokerReadinessSummary(summary)).toContain("finalProduct=blocked");
    expect(formatQueueBrokerReadinessSummary(summary)).toContain("status-result-consistency-smoke");
    expect(formatQueueBrokerReadinessSummary(summary)).toContain("idempotency-key-deduplication-smoke");
  });

  it("fails local readiness if the broker adapter leaks raw provider errors into dead letters", async () => {
    const summary = await runQueueBrokerReadiness({
      now: () => new Date("2026-06-10T01:30:00.000Z"),
      unsafeDeadLetterProbe: "raw upstream token should not be persisted"
    });

    expect(summary.localReadiness).toBe("failed");
    expect(summary.checks.find((check) => check.id === "redis-broker-adapter-contract")).toEqual({
      id: "redis-broker-adapter-contract",
      status: "failed",
      detail: "redis broker skeleton leaked raw provider error text into dead-letter diagnostics."
    });
    expect(chooseQueueBrokerReadinessExitCode(summary)).toBe(1);
  });
});
