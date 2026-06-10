import { describe, expect, it } from "vitest";

import {
  chooseExternalBlockerReadinessExitCode,
  formatExternalBlockerReadinessSummary,
  runExternalBlockerReadiness
} from "./external-blocker-readiness";

describe("external blocker readiness script", () => {
  it("keeps all real external blockers explicit with env/config/smoke handoff steps", () => {
    const summary = runExternalBlockerReadiness({
      now: () => new Date("2026-06-09T12:00:00.000Z"),
      env: {}
    });

    expect(summary.localReadiness).toBe("passed");
    expect(summary.externalIntegration).toBe("blocked");
    expect(summary.finalProduct).toBe("blocked");
    expect(summary.blockers.map((blocker) => blocker.id)).toEqual([
      "real-ocr-llm-lims-sandbox",
      "external-secret-manager",
      "production-session-store",
      "production-queue-broker"
    ]);
    expect(summary.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "real-ocr-llm-lims-sandbox",
          status: "blocked",
          missingEnv: expect.arrayContaining([
            "PRODUCTION_SMOKE_MODE=real-sandbox",
            "PRODUCTION_SMOKE_BASE_URL",
            "PRODUCTION_SMOKE_EMAIL",
            "PRODUCTION_SMOKE_PASSWORD"
          ]),
          missingConfig: expect.arrayContaining([
            "real OCR provider key or configured default provider",
            "real LLM provider key or configured default provider",
            "LIMS sandbox endpoint and writeback policy"
          ]),
          requiredCredentials: expect.arrayContaining([
            "sandbox user credentials",
            "OCR provider credential secretRef",
            "LLM provider credential secretRef",
            "LIMS API token secretRef"
          ]),
          requiredEndpoints: expect.arrayContaining([
            "GET /status",
            "POST /auth/login",
            "POST /files",
            "POST /jobs",
            "GET /results/:jobId",
            "POST /writeback"
          ]),
          smokeSteps: expect.arrayContaining([
            "real-external-api-login",
            "real-ocr-llm-lims-sandbox-smoke",
            "provider-health-secretRefs-smoke"
          ]),
          readinessGate: {
            env: {
              status: "missing",
              missing: expect.arrayContaining(["PRODUCTION_SMOKE_BASE_URL", "PRODUCTION_SMOKE_EMAIL"]),
              configured: []
            },
            config: {
              status: "missing",
              missing: expect.arrayContaining(["real OCR provider key or configured default provider"]),
              configured: []
            },
            endpoints: {
              status: "pending-smoke",
              required: expect.arrayContaining(["POST /jobs", "POST /writeback"])
            },
            credentials: {
              status: "missing",
              missing: expect.arrayContaining(["sandbox user credentials", "OCR provider credential secretRef"]),
              configured: []
            },
            smoke: {
              status: "pending-smoke",
              pending: expect.arrayContaining(["real-ocr-llm-lims-sandbox-smoke"]),
              command: "corepack pnpm smoke:production",
              expectedBlockedExitCode: 2
            }
          },
          unblockCriteria: expect.arrayContaining([
            "PRODUCTION_SMOKE_MODE=real-sandbox production smoke exits 0 against a real sandbox.",
            "Writeback smoke uses only server-side payload.writeback.readyFields."
          ])
        }),
        expect.objectContaining({
          id: "external-secret-manager",
          status: "blocked",
          missingEnv: expect.arrayContaining(["SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager"]),
          requiredCredentials: expect.arrayContaining([
            "Vault token or cloud KMS/Secret Manager service account",
            "provider secretRef read permission"
          ]),
          smokeSteps: expect.arrayContaining([
            "external-secret-resolution-smoke",
            "provider-response-secret-redaction-smoke",
            "provider-health-secret-redaction-smoke",
            "audit-metadata-secret-redaction-smoke"
          ]),
          readinessGate: expect.objectContaining({
            env: expect.objectContaining({
              status: "missing",
              missing: expect.arrayContaining(["SECRET_RESOLVER_PROVIDER"])
            }),
            smoke: expect.objectContaining({
              status: "pending-smoke",
              pending: expect.arrayContaining(["external-secret-resolution-smoke"])
            })
          })
        }),
        expect.objectContaining({
          id: "production-session-store",
          status: "blocked",
          missingEnv: expect.arrayContaining([
            "SESSION_INVALIDATION_STORE_MODE=repository",
            "SESSION_INVALIDATION_STORE_PROVIDER=database|redis",
            "SESSION_INVALIDATION_TTL_MS"
          ]),
          smokeSteps: expect.arrayContaining([
            "two-instance-session-invalidation-smoke",
            "token-hash-ttl-verification",
            "raw-token-not-persisted-check"
          ]),
          readinessGate: expect.objectContaining({
            env: expect.objectContaining({
              status: "missing",
              missing: expect.arrayContaining(["SESSION_INVALIDATION_STORE_MODE", "SESSION_INVALIDATION_STORE_PROVIDER"])
            }),
            smoke: expect.objectContaining({
              pending: expect.arrayContaining(["login-rotation-cross-instance-smoke"])
            })
          })
        }),
        expect.objectContaining({
          id: "production-queue-broker",
          status: "blocked",
          missingEnv: expect.arrayContaining([
            "QUEUE_MODE=broker",
            "QUEUE_BROKER_PROVIDER=redis|rabbitmq|sqs",
            "QUEUE_BROKER_URL",
            "QUEUE_NAME",
            "QUEUE_VISIBILITY_TIMEOUT_MS",
            "QUEUE_RETRY_LIMIT",
            "QUEUE_DEAD_LETTER_QUEUE"
          ]),
          smokeSteps: expect.arrayContaining([
            "multi-worker-lease-smoke",
            "retry-dead-letter-smoke",
            "heartbeat-status-consistency-smoke",
            "status-result-consistency-smoke"
          ]),
          readinessGate: expect.objectContaining({
            env: expect.objectContaining({
              status: "missing",
              missing: expect.arrayContaining(["QUEUE_MODE", "QUEUE_BROKER_PROVIDER", "QUEUE_BROKER_URL"])
            }),
            smoke: expect.objectContaining({
              pending: expect.arrayContaining(["idempotency-key-deduplication-smoke"])
            })
          })
        })
      ])
    );
    expect(summary.handoffChecklist).toEqual([
      "Do not mark finalProduct passed while any blocker remains blocked.",
      "Run corepack pnpm smoke:production with PRODUCTION_SMOKE_MODE=real-sandbox after real credentials are installed.",
      "Run corepack pnpm readiness:deployment and require localReadiness=passed plus externalIntegration=passed before finalProduct can pass.",
      "Attach redacted smoke logs that show env/config/endpoint/credential readiness without secret values."
    ]);
    expect(chooseExternalBlockerReadinessExitCode(summary)).toBe(2);
  });

  it("formats a compact operator summary without claiming final product readiness", () => {
    const summary = runExternalBlockerReadiness({
      now: () => new Date("2026-06-09T12:00:00.000Z"),
      env: {
        PRODUCTION_SMOKE_MODE: "real-sandbox",
        PRODUCTION_SMOKE_BASE_URL: "https://sandbox.example.local",
        PRODUCTION_SMOKE_EMAIL: "operator@example.local",
        PRODUCTION_SMOKE_PASSWORD: "redacted",
        PRODUCTION_SMOKE_SCHEMA_KEY: "lims-clinical-info",
        PRODUCTION_SMOKE_RUN_RECOGNITION: "true",
        PRODUCTION_SMOKE_RUN_WRITEBACK: "true",
        PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64: "UkVEQUNURUQ=",
        PRODUCTION_SMOKE_JOB_POLL_TIMEOUT_MS: "120000",
        OCR_PROVIDER: "http",
        OCR_ENDPOINT: "https://ocr.example.local",
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "medical-extractor",
        LLM_BASE_URL: "https://llm.example.local/v1",
        LLM_API_KEY: "redacted",
        LIMS_BASE_URL: "https://lims.example.local",
        LIMS_API_TOKEN: "redacted"
      }
    });
    const output = formatExternalBlockerReadinessSummary(summary);

    expect(output).toContain("localReadiness=passed");
    expect(output).toContain("externalIntegration=blocked");
    expect(output).toContain("finalProduct=blocked");
    expect(output).toContain("GATE real-ocr-llm-lims-sandbox env=configured");
    expect(output).toContain("GATE real-ocr-llm-lims-sandbox smoke=pending-smoke");
    expect(output).toContain("UNBLOCK real-ocr-llm-lims-sandbox");
    expect(output).toContain(
      "BLOCKED real-ocr-llm-lims-sandbox REAL_OCR_LLM_LIMS_SANDBOX_NOT_VERIFIED"
    );
    expect(output).toContain("SMOKE production-queue-broker status-result-consistency-smoke");
    expect(output).not.toContain("finalProduct=passed");
  });
});
