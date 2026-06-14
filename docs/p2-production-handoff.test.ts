import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("P2 production handoff documentation", () => {
  it("keeps real external sandbox, KMS and reliable queue work explicitly remaining", () => {
    const handoff = read("docs/2026-06-09-p2-production-handoff.md");

    expect(handoff).toContain("remaining/blocked");
    expect(handoff).toContain("PRODUCTION_SMOKE_MODE=real-sandbox");
    expect(handoff).toContain("PRODUCTION_SMOKE_BASE_URL");
    expect(handoff).toContain("KMS/Vault/Secret Manager");
    expect(handoff).toContain("SECRET_RESOLVER_PROVIDER");
    expect(handoff).toContain("SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED");
    expect(handoff).toContain("QUEUE_MODE=broker");
    expect(handoff).toContain("QUEUE_BROKER_PROVIDER=redis");
    expect(handoff).toContain("QUEUE_BROKER_ADAPTER_NOT_CONNECTED");
    expect(handoff).toContain("QUEUE_BROKER_SMOKE_NOT_RUN");
    expect(handoff).toContain("buildProductionQueueContract()");
    expect(handoff).toContain("QUEUE_BROKER_CONTRACT_INCOMPLETE");
    expect(handoff).toContain("createRedisJobQueueAdapter()");
    expect(handoff).toContain("createVaultSecretResolver()");
    expect(handoff).toContain("corepack pnpm readiness:deployment");
    expect(handoff).toContain("corepack pnpm readiness:external-blockers");
    expect(handoff).toContain("GATE real-ocr-llm-lims-sandbox env=");
    expect(handoff).toContain("UNBLOCK production-queue-broker");
    expect(handoff).toContain("exit code 2");
    expect(handoff).toContain("localReadiness=passed");
    expect(handoff).toContain("finalProduct=blocked");
    expect(handoff).toContain("STATUS blocked");
    expect(handoff).toContain("JobQueueAdapter");
    expect(handoff).toContain("lease/retry/dead-letter/heartbeat");
    expect(handoff).toContain("Redis/RabbitMQ/SQS");
    expect(handoff).toContain("不能把 mock-production 当作真实外部 sandbox 通过");
  });

  it("documents browser E2E script status without replacing real external smoke", () => {
    const readme = read("README.md");
    const handoff = read("docs/2026-06-09-p2-production-handoff.md");

    expect(readme).toContain("pnpm e2e:demo-web:browser");
    expect(readme).toContain("browserE2E=passed / blocked");
    expect(handoff).toContain("ui-parity-screenshots/medical-e2e-current");
    expect(handoff).toContain("真实浏览器 E2E 不等同于真实 OCR/LLM/LIMS sandbox 验收");
  });

  it("documents the closed demo-web chunk warning without hiding the Vite limit", () => {
    const handoff = read("docs/2026-06-09-p2-production-handoff.md");
    const viteConfig = read("medical-ui/vite.config.ts");

    expect(handoff).toContain("不再出现 Vite 500 kB chunk warning");
    expect(handoff).toContain("vendor-arco");
    expect(handoff).toContain("约 415.91 kB");
    // medical-ui uses an explicit chunkSizeWarningLimit (>= 500) to accommodate Arco Design vendor chunk
    expect(viteConfig).toContain("chunkSizeWarningLimit");
  });

  it("documents machine-readable blocked diagnostics for smoke and readiness handoff", () => {
    const handoff = read("docs/2026-06-09-p2-production-handoff.md");

    expect(handoff).toContain("SUMMARY_JSON");
    expect(handoff).toContain("nextAction");
    expect(handoff).toContain("requiredChecks");
    expect(handoff).toContain("BLOCKED_DETAIL");
    expect(handoff).toContain("PRODUCTION_SMOKE_CONFIGURATION_MISSING");
    expect(handoff).toContain("two-instance-session-invalidation-smoke");
    expect(handoff).toContain("login-rotation-cross-instance-smoke");
    expect(handoff).toContain("heartbeat-status-consistency-smoke");
    expect(handoff).toContain("idempotency-key-deduplication-smoke");
    expect(handoff).toContain("writeback-readyFields-only-smoke");
  });

  it("documents provider response and audit metadata secret redaction smoke checks", () => {
    const handoff = read("docs/2026-06-09-p2-production-handoff.md");

    expect(handoff).toContain("provider-health-secret-redaction-smoke");
    expect(handoff).toContain("provider-response-secret-redaction-smoke");
    expect(handoff).toContain("audit-metadata-secret-redaction-smoke");
    expect(handoff).toContain("secretDiagnostics.value");
    expect(handoff).toContain("Authorization");
    expect(handoff).toContain("x-api-token");
    expect(handoff).toContain("actorApiTokenId");
    expect(handoff).toContain("secretRef 名称可以返回");
  });
});
