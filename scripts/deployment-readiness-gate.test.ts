import { describe, expect, it, vi } from "vitest";

import {
  buildDeploymentReadinessCommandPlan,
  chooseDeploymentReadinessExitCode,
  formatDeploymentReadinessSummary,
  runDeploymentReadinessGate,
  type DeploymentReadinessCommandResult
} from "./deployment-readiness-gate";

describe("deployment readiness gate", () => {
  it("builds the required P1/P2 deployment readiness command matrix", () => {
    const plan = buildDeploymentReadinessCommandPlan();

    expect(plan.map((check) => check.id)).toEqual([
      "typecheck",
      "unit-tests",
      "web-typecheck",
      "web-tests",
      "web-build",
      "served-app-readiness",
      "web-smoke",
      "web-browser-e2e",
      "external-blocker-readiness",
      "queue-broker-readiness",
      "production-smoke-real",
      "production-smoke-mock"
    ]);
    expect(plan.find((check) => check.id === "external-blocker-readiness")).toEqual(
      expect.objectContaining({
        phase: "external-blocker-readiness",
        requiredForLocalReadiness: false,
        command: ["corepack", "pnpm", "readiness:external-blockers"]
      })
    );
    expect(plan.find((check) => check.id === "served-app-readiness")).toEqual(
      expect.objectContaining({
        phase: "local-readiness",
        requiredForLocalReadiness: true,
        command: ["corepack", "pnpm", "readiness:served-app"]
      })
    );
    expect(plan.find((check) => check.id === "production-smoke-real")).toEqual(
      expect.objectContaining({
        phase: "real-production",
        requiredForLocalReadiness: false,
        command: ["corepack", "pnpm", "smoke:production"]
      })
    );
    expect(plan.find((check) => check.id === "queue-broker-readiness")).toEqual(
      expect.objectContaining({
        phase: "external-blocker-readiness",
        requiredForLocalReadiness: false,
        command: ["corepack", "pnpm", "readiness:queue-broker"]
      })
    );
    expect(plan.find((check) => check.id === "production-smoke-mock")).toEqual(
      expect.objectContaining({
        phase: "mock-production",
        requiredForLocalReadiness: true,
        env: {
          PRODUCTION_SMOKE_MODE: "mock-production",
          PRODUCTION_SMOKE_RUN_WRITEBACK: "1"
        }
      })
    );
  });

  it("marks local deployment readiness passed while keeping real external production blocked", async () => {
    const runner = vi.fn(async (check): Promise<DeploymentReadinessCommandResult> => {
      if (check.id === "production-smoke-real") {
        const summaryJson = {
          mode: "blocked",
          status: "blocked",
          blockedSteps: [
            {
              name: "configuration",
              code: "PRODUCTION_SMOKE_CONFIGURATION_MISSING",
              missingKeys: ["PRODUCTION_SMOKE_BASE_URL"],
              nextAction: "配置真实 sandbox 后重跑 corepack pnpm smoke:production。",
              requiredChecks: ["real-external-api-login", "real-ocr-llm-lims-sandbox-smoke"]
            },
            {
              name: "queue-broker",
              code: "QUEUE_BROKER_NOT_CONFIGURED",
              adapter: "not-configured",
              nextAction: "配置真实 broker 与 worker 后运行多实例队列 smoke。",
              requiredChecks: ["multi-worker-lease-smoke"]
            }
          ],
          failedSteps: []
        };

        return {
          exitCode: 2,
          stdout: [
            "MODE blocked",
            "STATUS blocked",
            "BLOCKED configuration external sandbox blocked",
            "BLOCKED secret-resolver SECRET_RESOLVER_ENV_ONLY",
            "BLOCKED session-invalidation-store SESSION_INVALIDATION_STORE_IN_MEMORY",
            "BLOCKED queue-broker QUEUE_BROKER_NOT_CONFIGURED",
            `SUMMARY_JSON ${JSON.stringify(summaryJson)}`
          ].join("\n"),
          stderr: ""
        };
      }

      if (check.id === "external-blocker-readiness") {
        const summaryJson = {
          localReadiness: "passed",
          externalIntegration: "blocked",
          finalProduct: "blocked",
          blockers: [
            {
              id: "real-ocr-llm-lims-sandbox",
              code: "REAL_OCR_LLM_LIMS_SANDBOX_NOT_VERIFIED",
              missingEnv: ["PRODUCTION_SMOKE_MODE=real-sandbox", "PRODUCTION_SMOKE_BASE_URL"],
              missingConfig: ["real OCR provider key or configured default provider"],
              requiredEndpoints: ["GET /status", "POST /jobs"],
              requiredCredentials: ["OCR provider credential secretRef"],
              smokeSteps: ["real-ocr-llm-lims-sandbox-smoke"],
              nextAction: "安装真实 sandbox 凭据后重跑 production smoke。"
            }
          ]
        };

        return {
          exitCode: 2,
          stdout: [
            JSON.stringify(summaryJson, null, 2),
            `SUMMARY_JSON ${JSON.stringify(summaryJson)}`,
            "localReadiness=passed",
            "externalIntegration=blocked",
            "finalProduct=blocked"
          ].join("\n"),
          stderr: ""
        };
      }

      if (check.id === "queue-broker-readiness") {
        const summaryJson = {
          localReadiness: "passed",
          externalIntegration: "blocked",
          finalProduct: "blocked",
          blockedSteps: [
            {
              name: "queue-broker",
              code: "QUEUE_BROKER_SMOKE_NOT_RUN",
              adapter: "local-contract-only",
              nextAction: "接入真实 broker 与 worker 后运行多实例队列 smoke。",
              requiredChecks: [
                "multi-worker-lease-smoke",
                "retry-dead-letter-smoke",
                "heartbeat-status-consistency-smoke",
                "status-result-consistency-smoke",
                "idempotency-key-deduplication-smoke"
              ]
            }
          ]
        };

        return {
          exitCode: 2,
          stdout: [
            `SUMMARY_JSON ${JSON.stringify(summaryJson)}`,
            "localReadiness=passed",
            "externalIntegration=blocked",
            "finalProduct=blocked"
          ].join("\n"),
          stderr: ""
        };
      }

      return {
        exitCode: 0,
        stdout: check.id === "web-browser-e2e" ? '{"browserE2E":"passed"}' : "ok",
        stderr: ""
      };
    });

    const summary = await runDeploymentReadinessGate({ runner });

    expect(summary.localReadiness.status).toBe("passed");
    expect(summary.externalIntegration.status).toBe("blocked");
    expect(summary.externalIntegration.blockedDiagnostics).toHaveLength(4);
    expect(summary.externalIntegration.blockedDiagnostics).toEqual(
      expect.arrayContaining([
        {
          checkId: "production-smoke-real",
          name: "configuration",
          code: "PRODUCTION_SMOKE_CONFIGURATION_MISSING",
          missingKeys: ["PRODUCTION_SMOKE_BASE_URL"],
          nextAction: "配置真实 sandbox 后重跑 corepack pnpm smoke:production。",
          requiredChecks: ["real-external-api-login", "real-ocr-llm-lims-sandbox-smoke"]
        },
        {
          checkId: "production-smoke-real",
          name: "queue-broker",
          code: "QUEUE_BROKER_NOT_CONFIGURED",
          adapter: "not-configured",
          nextAction: "配置真实 broker 与 worker 后运行多实例队列 smoke。",
          requiredChecks: ["multi-worker-lease-smoke"]
        },
        {
          checkId: "external-blocker-readiness",
          name: "real-ocr-llm-lims-sandbox",
          code: "REAL_OCR_LLM_LIMS_SANDBOX_NOT_VERIFIED",
          missingEnv: ["PRODUCTION_SMOKE_MODE=real-sandbox", "PRODUCTION_SMOKE_BASE_URL"],
          missingConfig: ["real OCR provider key or configured default provider"],
          requiredEndpoints: ["GET /status", "POST /jobs"],
          requiredCredentials: ["OCR provider credential secretRef"],
          nextAction: "安装真实 sandbox 凭据后重跑 production smoke。",
          requiredChecks: ["real-ocr-llm-lims-sandbox-smoke"]
        },
        {
          checkId: "queue-broker-readiness",
          name: "queue-broker",
          code: "QUEUE_BROKER_SMOKE_NOT_RUN",
          adapter: "local-contract-only",
          nextAction: "接入真实 broker 与 worker 后运行多实例队列 smoke。",
          requiredChecks: [
            "multi-worker-lease-smoke",
            "retry-dead-letter-smoke",
            "heartbeat-status-consistency-smoke",
            "status-result-consistency-smoke",
            "idempotency-key-deduplication-smoke"
          ]
        }
      ])
    );
    expect(summary.finalProduct.status).toBe("blocked");
    expect(summary.checks.find((check) => check.id === "production-smoke-real")).toEqual(
      expect.objectContaining({
        status: "blocked",
        exitCode: 2
      })
    );
    expect(chooseDeploymentReadinessExitCode(summary)).toBe(2);
    expect(formatDeploymentReadinessSummary(summary)).toContain("finalProduct=blocked");
    expect(formatDeploymentReadinessSummary(summary)).toContain(
      "BLOCKED_DETAIL production-smoke-real queue-broker QUEUE_BROKER_NOT_CONFIGURED"
    );
    expect(formatDeploymentReadinessSummary(summary)).toContain(
      "BLOCKED_DETAIL external-blocker-readiness real-ocr-llm-lims-sandbox REAL_OCR_LLM_LIMS_SANDBOX_NOT_VERIFIED"
    );
    expect(summary.finalProduct.reason).toContain("session invalidation store");
    expect(summary.finalProduct.reason).toContain("本地 readiness");
    expect(summary.finalProduct.reason).toContain("真实外部集成");
    expect(summary.finalProduct.reason).toContain("医疗最终产品");
  });

  it("treats browser E2E blocked as visible but not a local readiness failure when the environment lacks a browser", async () => {
    const runner = vi.fn(async (check): Promise<DeploymentReadinessCommandResult> => {
      if (check.id === "web-browser-e2e") {
        return {
          exitCode: 2,
          stdout: '{"browserE2E":"blocked","reason":"no browser"}',
          stderr: ""
        };
      }

      if (check.id === "production-smoke-real") {
        return {
          exitCode: 2,
          stdout: "MODE blocked\nSTATUS blocked\nBLOCKED configuration missing external sandbox",
          stderr: ""
        };
      }

      return {
        exitCode: 0,
        stdout: "ok",
        stderr: ""
      };
    });

    const summary = await runDeploymentReadinessGate({ runner });

    expect(summary.checks.find((check) => check.id === "web-browser-e2e")).toEqual(
      expect.objectContaining({
        status: "blocked",
        requiredForLocalReadiness: false
      })
    );
    expect(summary.localReadiness.status).toBe("passed");
    expect(summary.finalProduct.status).toBe("blocked");
  });

  it("fails local readiness when a required local command fails", async () => {
    const runner = vi.fn(async (check): Promise<DeploymentReadinessCommandResult> => {
      if (check.id === "unit-tests") {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "1 failed"
        };
      }

      return {
        exitCode: 0,
        stdout: "ok",
        stderr: ""
      };
    });

    const summary = await runDeploymentReadinessGate({ runner });

    expect(summary.localReadiness.status).toBe("failed");
    expect(summary.finalProduct.status).toBe("failed");
    expect(chooseDeploymentReadinessExitCode(summary)).toBe(1);
  });
});
