import { isCliEntrypoint } from "./production-smoke";

export type ExternalBlockerReadinessStatus = "passed" | "blocked" | "failed";

export interface ExternalBlockerDiagnostic {
  id: string;
  title: string;
  status: Extract<ExternalBlockerReadinessStatus, "blocked">;
  code: string;
  missingEnv: string[];
  missingConfig: string[];
  requiredEndpoints: string[];
  requiredCredentials: string[];
  smokeSteps: string[];
  readinessGate: ExternalBlockerReadinessGate;
  unblockCriteria: string[];
  nextAction: string;
}

export type ExternalBlockerGateSectionStatus = "configured" | "missing" | "pending-smoke";

export interface ExternalBlockerPresenceGate {
  status: Extract<ExternalBlockerGateSectionStatus, "configured" | "missing">;
  missing: string[];
  configured: string[];
}

export interface ExternalBlockerEndpointGate {
  status: Extract<ExternalBlockerGateSectionStatus, "pending-smoke">;
  required: string[];
}

export interface ExternalBlockerSmokeGate {
  status: Extract<ExternalBlockerGateSectionStatus, "pending-smoke">;
  pending: string[];
  command: string;
  expectedBlockedExitCode: 2;
}

export interface ExternalBlockerReadinessGate {
  env: ExternalBlockerPresenceGate;
  config: ExternalBlockerPresenceGate;
  endpoints: ExternalBlockerEndpointGate;
  credentials: ExternalBlockerPresenceGate;
  smoke: ExternalBlockerSmokeGate;
}

export interface ExternalBlockerReadinessSummary {
  generatedAt: string;
  localReadiness: Extract<ExternalBlockerReadinessStatus, "passed">;
  externalIntegration: Extract<ExternalBlockerReadinessStatus, "blocked">;
  finalProduct: Extract<ExternalBlockerReadinessStatus, "blocked">;
  blockers: ExternalBlockerDiagnostic[];
  handoffChecklist: string[];
}

export interface RunExternalBlockerReadinessOptions {
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

type EnvPredicate = (env: Record<string, string | undefined>) => boolean;

interface ExternalBlockerRequirement {
  label: string;
  gateLabel?: string;
  configured: EnvPredicate;
}

interface ExternalBlockerDefinition {
  id: string;
  title: string;
  code: string;
  env: ExternalBlockerRequirement[];
  config: ExternalBlockerRequirement[];
  endpoints: string[];
  credentials: ExternalBlockerRequirement[];
  smokeSteps: string[];
  unblockCriteria: string[];
  nextAction: string;
}

function hasValue(value: string | undefined) {
  return typeof value === "string" && value.length > 0;
}

function hasExpectedValue(key: string, expected: string): EnvPredicate {
  return (env) => env[key] === expected;
}

function hasTruthyFlag(key: string): EnvPredicate {
  return (env) => env[key] === "1" || env[key] === "true" || env[key] === "TRUE";
}

function hasAnyValue(...keys: string[]): EnvPredicate {
  return (env) => keys.some((key) => hasValue(env[key]));
}

function hasAllValues(...keys: string[]): EnvPredicate {
  return (env) => keys.every((key) => hasValue(env[key]));
}

function hasExternalSecretProvider(env: Record<string, string | undefined>) {
  return ["vault", "kms", "secret-manager"].includes(env.SECRET_RESOLVER_PROVIDER ?? "");
}

function hasExternalSecretProviderConfig(env: Record<string, string | undefined>) {
  if (env.SECRET_RESOLVER_PROVIDER === "vault") {
    return hasAllValues("VAULT_ADDR", "VAULT_TOKEN")(env);
  }

  if (env.SECRET_RESOLVER_PROVIDER === "kms") {
    return hasAllValues("KMS_KEY_ID", "KMS_REGION")(env);
  }

  if (env.SECRET_RESOLVER_PROVIDER === "secret-manager") {
    return hasAllValues("SECRET_MANAGER_PROJECT", "SECRET_MANAGER_REGION")(env);
  }

  return false;
}

function hasSessionStoreProvider(env: Record<string, string | undefined>) {
  return ["database", "redis"].includes(env.SESSION_INVALIDATION_STORE_PROVIDER ?? "");
}

function hasQueueProvider(env: Record<string, string | undefined>) {
  return ["redis", "rabbitmq", "sqs"].includes(env.QUEUE_BROKER_PROVIDER ?? "");
}

function evaluatePresenceGate(requirements: ExternalBlockerRequirement[], env: Record<string, string | undefined>) {
  const missing: string[] = [];
  const configured: string[] = [];

  for (const requirement of requirements) {
    const label = requirement.gateLabel ?? requirement.label;
    if (requirement.configured(env)) {
      configured.push(label);
    } else {
      missing.push(label);
    }
  }

  return {
    status: missing.length === 0 ? "configured" : "missing",
    missing,
    configured
  } satisfies ExternalBlockerPresenceGate;
}

function collectMissingRequirementLabels(
  requirements: ExternalBlockerRequirement[],
  env: Record<string, string | undefined>
) {
  return requirements
    .filter((requirement) => !requirement.configured(env))
    .map((requirement) => requirement.label);
}

function buildDiagnostic(
  definition: ExternalBlockerDefinition,
  env: Record<string, string | undefined>
): ExternalBlockerDiagnostic {
  const envGate = evaluatePresenceGate(definition.env, env);
  const configGate = evaluatePresenceGate(definition.config, env);
  const credentialGate = evaluatePresenceGate(definition.credentials, env);

  return {
    id: definition.id,
    title: definition.title,
    status: "blocked",
    code: definition.code,
    missingEnv: collectMissingRequirementLabels(definition.env, env),
    missingConfig: collectMissingRequirementLabels(definition.config, env),
    requiredEndpoints: [...definition.endpoints],
    requiredCredentials: collectMissingRequirementLabels(definition.credentials, env),
    smokeSteps: [...definition.smokeSteps],
    readinessGate: {
      env: envGate,
      config: configGate,
      endpoints: {
        status: "pending-smoke",
        required: [...definition.endpoints]
      },
      credentials: credentialGate,
      smoke: {
        status: "pending-smoke",
        pending: [...definition.smokeSteps],
        command: "corepack pnpm smoke:production",
        expectedBlockedExitCode: 2
      }
    },
    unblockCriteria: [...definition.unblockCriteria],
    nextAction: definition.nextAction
  };
}

const BLOCKER_DEFINITIONS: ExternalBlockerDefinition[] = [
  {
    id: "real-ocr-llm-lims-sandbox",
    title: "Real OCR/LLM/LIMS Sandbox",
    code: "REAL_OCR_LLM_LIMS_SANDBOX_NOT_VERIFIED",
    env: [
      {
        label: "PRODUCTION_SMOKE_MODE=real-sandbox",
        configured: hasExpectedValue("PRODUCTION_SMOKE_MODE", "real-sandbox")
      },
      { label: "PRODUCTION_SMOKE_BASE_URL", configured: hasAnyValue("PRODUCTION_SMOKE_BASE_URL") },
      { label: "PRODUCTION_SMOKE_EMAIL", configured: hasAnyValue("PRODUCTION_SMOKE_EMAIL") },
      { label: "PRODUCTION_SMOKE_PASSWORD", configured: hasAnyValue("PRODUCTION_SMOKE_PASSWORD") },
      { label: "PRODUCTION_SMOKE_SCHEMA_KEY", configured: hasAnyValue("PRODUCTION_SMOKE_SCHEMA_KEY") },
      {
        label: "PRODUCTION_SMOKE_RUN_RECOGNITION=true",
        configured: hasTruthyFlag("PRODUCTION_SMOKE_RUN_RECOGNITION")
      },
      {
        label: "PRODUCTION_SMOKE_RUN_WRITEBACK=true",
        configured: hasTruthyFlag("PRODUCTION_SMOKE_RUN_WRITEBACK")
      }
    ],
    config: [
      {
        label: "real OCR provider key or configured default provider",
        configured: (env) =>
          hasAnyValue("PRODUCTION_SMOKE_OCR_PROVIDER_KEY")(env) ||
          (env.OCR_PROVIDER === "http" && hasAnyValue("OCR_ENDPOINT")(env))
      },
      {
        label: "real LLM provider key or configured default provider",
        configured: (env) =>
          hasAnyValue("PRODUCTION_SMOKE_PROVIDER_KEY")(env) ||
          (env.LLM_PROVIDER === "openai-compatible" &&
            hasAllValues("LLM_MODEL", "LLM_BASE_URL")(env) &&
            hasAnyValue("LLM_API_KEY", "OPENAI_API_KEY")(env)) ||
          (env.LLM_PROVIDER === "openai-responses" && hasAllValues("LLM_MODEL", "OPENAI_API_KEY")(env)) ||
          (env.LLM_PROVIDER === "langchain" && hasAllValues("LLM_MODEL")(env) && hasAnyValue("LLM_API_KEY", "OPENAI_API_KEY")(env))
      },
      {
        label: "LIMS sandbox endpoint and writeback policy",
        configured: hasAllValues("LIMS_BASE_URL", "LIMS_API_TOKEN")
      },
      {
        label: "approved deidentified synthetic or sandbox medical record fixture",
        configured: hasAnyValue("PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64")
      },
      {
        label: "job polling timeout aligned with provider SLA",
        configured: hasAnyValue("PRODUCTION_SMOKE_JOB_POLL_TIMEOUT_MS")
      }
    ],
    endpoints: [
      "GET /status",
      "POST /auth/login",
      "GET /providers",
      "POST /providers/:key/health",
      "POST /files",
      "POST /jobs",
      "GET /jobs/:jobId",
      "GET /results/:jobId",
      "POST /writeback"
    ],
    credentials: [
      {
        label: "sandbox user credentials",
        configured: hasAllValues("PRODUCTION_SMOKE_EMAIL", "PRODUCTION_SMOKE_PASSWORD")
      },
      {
        label: "OCR provider credential secretRef",
        configured: hasAnyValue("PRODUCTION_SMOKE_OCR_PROVIDER_KEY", "OCR_API_KEY", "OCR_API_KEY_REF")
      },
      {
        label: "LLM provider credential secretRef",
        configured: hasAnyValue("PRODUCTION_SMOKE_PROVIDER_KEY", "LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY_REF")
      },
      {
        label: "LIMS API token secretRef",
        configured: hasAnyValue("LIMS_API_TOKEN", "LIMS_API_TOKEN_REF")
      }
    ],
    smokeSteps: [
      "real-external-api-login",
      "real-provider-sandbox-connectivity-smoke",
      "real-ocr-llm-lims-sandbox-smoke",
      "provider-health-secretRefs-smoke",
      "writeback-readyFields-only-smoke"
    ],
    unblockCriteria: [
      "PRODUCTION_SMOKE_MODE=real-sandbox production smoke exits 0 against a real sandbox.",
      "Provider health proves OCR and LLM sandbox connectivity through secretRefs.",
      "Recognition smoke uploads an approved deidentified fixture and reaches a terminal result.",
      "Writeback smoke uses only server-side payload.writeback.readyFields."
    ],
    nextAction:
      "Install real sandbox URL, credentials, provider secretRefs and a deidentified fixture, then run corepack pnpm smoke:production with PRODUCTION_SMOKE_MODE=real-sandbox."
  },
  {
    id: "external-secret-manager",
    title: "Real KMS/Vault/Secret Manager",
    code: "EXTERNAL_SECRET_MANAGER_NOT_VERIFIED",
    env: [
      {
        label: "SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager",
        gateLabel: "SECRET_RESOLVER_PROVIDER",
        configured: hasExternalSecretProvider
      },
      {
        label: "VAULT_ADDR and VAULT_TOKEN or KMS_KEY_ID/KMS_REGION or SECRET_MANAGER_PROJECT/SECRET_MANAGER_REGION",
        configured: hasExternalSecretProviderConfig
      }
    ],
    config: [
      { label: "real resolver client/SDK injection", configured: () => false },
      { label: "provider secretRef naming convention", configured: hasAnyValue("PROVIDER_SECRET_REF_PREFIX") },
      { label: "fail-fast policy for unreadable provider secrets", configured: () => true },
      { label: "redacted health and audit response policy", configured: () => true }
    ],
    endpoints: ["GET /status", "GET /providers", "POST /providers/:key/health", "GET /audit"],
    credentials: [
      {
        label: "Vault token or cloud KMS/Secret Manager service account",
        configured: hasExternalSecretProviderConfig
      },
      { label: "provider secretRef read permission", configured: hasAnyValue("PROVIDER_SECRET_REF_READ_POLICY") },
      { label: "rotation test secretRef", configured: hasAnyValue("SECRET_ROTATION_TEST_REF") }
    ],
    smokeSteps: [
      "external-secret-resolution-smoke",
      "provider-health-secretRefs-smoke",
      "provider-response-secret-redaction-smoke",
      "provider-health-secret-redaction-smoke",
      "audit-metadata-secret-redaction-smoke"
    ],
    unblockCriteria: [
      "SECRET_RESOLVER_PROVIDER is vault, kms or secret-manager with a real client/SDK connected.",
      "External secret resolution smoke reads configured secretRefs without returning plaintext values.",
      "Provider, provider health and audit responses pass redaction smoke."
    ],
    nextAction:
      "Wire a real secret manager client, prove secretRefs resolve without exposing values, and rerun provider health plus production smoke."
  },
  {
    id: "production-session-store",
    title: "Production Multi-instance Session Store",
    code: "PRODUCTION_SESSION_STORE_NOT_VERIFIED",
    env: [
      {
        label: "SESSION_INVALIDATION_STORE_MODE=repository",
        gateLabel: "SESSION_INVALIDATION_STORE_MODE",
        configured: hasExpectedValue("SESSION_INVALIDATION_STORE_MODE", "repository")
      },
      {
        label: "SESSION_INVALIDATION_STORE_PROVIDER=database|redis",
        gateLabel: "SESSION_INVALIDATION_STORE_PROVIDER",
        configured: hasSessionStoreProvider
      },
      { label: "SESSION_INVALIDATION_TTL_MS", configured: hasAnyValue("SESSION_INVALIDATION_TTL_MS") },
      {
        label: "SESSION_INVALIDATION_REDIS_KEY_PREFIX or database migration/delegate wiring",
        configured: (env) =>
          (env.SESSION_INVALIDATION_STORE_PROVIDER === "redis" &&
            hasAnyValue("SESSION_INVALIDATION_REDIS_KEY_PREFIX")(env)) ||
          (env.SESSION_INVALIDATION_STORE_PROVIDER === "database" && hasAnyValue("DATABASE_URL")(env))
      }
    ],
    config: [
      { label: "shared database or Redis store reachable by at least two API instances", configured: () => false },
      { label: "token hash and TTL inspection access", configured: hasAnyValue("SESSION_STORE_INSPECTION_DSN") },
      { label: "load balancer or direct instance URLs for cross-instance smoke", configured: hasAllValues("API_INSTANCE_A_URL", "API_INSTANCE_B_URL") }
    ],
    endpoints: ["POST /auth/login", "POST /auth/logout", "GET /auth/me", "GET /status"],
    credentials: [
      {
        label: "test user credentials",
        configured: hasAllValues("PRODUCTION_SMOKE_EMAIL", "PRODUCTION_SMOKE_PASSWORD")
      },
      {
        label: "database or Redis inspection credential",
        configured: hasAnyValue("SESSION_STORE_INSPECTION_DSN", "REDIS_URL", "DATABASE_URL")
      }
    ],
    smokeSteps: [
      "two-instance-session-invalidation-smoke",
      "token-hash-ttl-verification",
      "raw-token-not-persisted-check",
      "login-rotation-cross-instance-smoke"
    ],
    unblockCriteria: [
      "At least two API instances share the same database or Redis invalidation store.",
      "Logout or login rotation on instance A makes instance B reject the old cookie with 401.",
      "Store inspection proves token hash plus TTL only, with no raw JWT or cookie header."
    ],
    nextAction:
      "Start two API instances against the same database/Redis session store, logout or rotate on instance A, and prove instance B rejects the old cookie."
  },
  {
    id: "production-queue-broker",
    title: "Production Reliable Queue Broker",
    code: "PRODUCTION_QUEUE_BROKER_NOT_VERIFIED",
    env: [
      { label: "QUEUE_MODE=broker", gateLabel: "QUEUE_MODE", configured: hasExpectedValue("QUEUE_MODE", "broker") },
      {
        label: "QUEUE_BROKER_PROVIDER=redis|rabbitmq|sqs",
        gateLabel: "QUEUE_BROKER_PROVIDER",
        configured: hasQueueProvider
      },
      { label: "QUEUE_BROKER_URL", configured: hasAnyValue("QUEUE_BROKER_URL") },
      { label: "QUEUE_NAME", configured: hasAnyValue("QUEUE_NAME") },
      { label: "QUEUE_VISIBILITY_TIMEOUT_MS", configured: hasAnyValue("QUEUE_VISIBILITY_TIMEOUT_MS") },
      { label: "QUEUE_RETRY_LIMIT", configured: hasAnyValue("QUEUE_RETRY_LIMIT") },
      { label: "QUEUE_DEAD_LETTER_QUEUE", configured: hasAnyValue("QUEUE_DEAD_LETTER_QUEUE") },
      { label: "WORKER_CONCURRENCY", configured: hasAnyValue("WORKER_CONCURRENCY") }
    ],
    config: [
      { label: "real Redis/RabbitMQ/SQS broker", configured: () => false },
      { label: "at least two workers sharing the broker", configured: hasAllValues("WORKER_INSTANCE_A_ID", "WORKER_INSTANCE_B_ID") },
      { label: "dead-letter queue inspection", configured: hasAnyValue("QUEUE_DEAD_LETTER_INSPECTION_URL") },
      { label: "job idempotency key strategy", configured: () => true },
      { label: "job status/result consistency monitor", configured: hasAnyValue("JOB_STATUS_RESULT_MONITOR_URL") }
    ],
    endpoints: ["POST /jobs", "GET /jobs/:jobId", "GET /results/:jobId", "GET /status"],
    credentials: [
      { label: "broker credential", configured: hasAnyValue("QUEUE_BROKER_URL", "QUEUE_BROKER_TOKEN") },
      { label: "worker runtime credential", configured: hasAnyValue("WORKER_RUNTIME_TOKEN", "DATABASE_URL") },
      { label: "dead-letter queue inspection credential", configured: hasAnyValue("QUEUE_DEAD_LETTER_INSPECTION_TOKEN") }
    ],
    smokeSteps: [
      "multi-worker-lease-smoke",
      "retry-dead-letter-smoke",
      "heartbeat-status-consistency-smoke",
      "status-result-consistency-smoke",
      "idempotency-key-deduplication-smoke"
    ],
    unblockCriteria: [
      "Two or more workers share a real Redis, RabbitMQ or SQS broker.",
      "Lease smoke proves one job is processed by only one worker at a time.",
      "Retry/dead-letter, heartbeat recovery, idempotency and status-result consistency smoke all pass."
    ],
    nextAction:
      "Run real broker with two workers and verify lease exclusivity, retry/dead-letter, heartbeat recovery, idempotency and API status/result consistency."
  }
];

const HANDOFF_CHECKLIST = [
  "Do not mark finalProduct passed while any blocker remains blocked.",
  "Run corepack pnpm smoke:production with PRODUCTION_SMOKE_MODE=real-sandbox after real credentials are installed.",
  "Run corepack pnpm readiness:deployment and require localReadiness=passed plus externalIntegration=passed before finalProduct can pass.",
  "Attach redacted smoke logs that show env/config/endpoint/credential readiness without secret values."
];

export function runExternalBlockerReadiness(
  options: RunExternalBlockerReadinessOptions = {}
): ExternalBlockerReadinessSummary {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;

  return {
    generatedAt: now().toISOString(),
    localReadiness: "passed",
    externalIntegration: "blocked",
    finalProduct: "blocked",
    blockers: BLOCKER_DEFINITIONS.map((definition) => buildDiagnostic(definition, env)),
    handoffChecklist: [...HANDOFF_CHECKLIST]
  };
}

export function chooseExternalBlockerReadinessExitCode(summary: ExternalBlockerReadinessSummary) {
  return summary.finalProduct === "blocked" ? 2 : 0;
}

export function formatExternalBlockerReadinessSummary(summary: ExternalBlockerReadinessSummary) {
  const lines = [
    `localReadiness=${summary.localReadiness}`,
    `externalIntegration=${summary.externalIntegration}`,
    `finalProduct=${summary.finalProduct}`
  ];

  for (const blocker of summary.blockers) {
    lines.push(`BLOCKED ${blocker.id} ${blocker.code} nextAction=${blocker.nextAction}`);
    lines.push(`ENV ${blocker.id} ${blocker.missingEnv.join(",")}`);
    lines.push(`CONFIG ${blocker.id} ${blocker.missingConfig.join(",")}`);
    lines.push(`ENDPOINTS ${blocker.id} ${blocker.requiredEndpoints.join(",")}`);
    lines.push(`CREDENTIALS ${blocker.id} ${blocker.requiredCredentials.join(",")}`);
    lines.push(
      `GATE ${blocker.id} env=${blocker.readinessGate.env.status} missing=${blocker.readinessGate.env.missing.join(",") || "none"}`
    );
    lines.push(
      `GATE ${blocker.id} config=${blocker.readinessGate.config.status} missing=${blocker.readinessGate.config.missing.join(",") || "none"}`
    );
    lines.push(
      `GATE ${blocker.id} endpoints=${blocker.readinessGate.endpoints.status} required=${blocker.readinessGate.endpoints.required.join(",")}`
    );
    lines.push(
      `GATE ${blocker.id} credentials=${blocker.readinessGate.credentials.status} missing=${blocker.readinessGate.credentials.missing.join(",") || "none"}`
    );
    lines.push(
      `GATE ${blocker.id} smoke=${blocker.readinessGate.smoke.status} pending=${blocker.readinessGate.smoke.pending.join(",")} command=${blocker.readinessGate.smoke.command} expectedBlockedExitCode=${blocker.readinessGate.smoke.expectedBlockedExitCode}`
    );
    for (const smokeStep of blocker.smokeSteps) {
      lines.push(`SMOKE ${blocker.id} ${smokeStep}`);
    }
    for (const criteria of blocker.unblockCriteria) {
      lines.push(`UNBLOCK ${blocker.id} ${criteria}`);
    }
  }

  for (const item of summary.handoffChecklist) {
    lines.push(`HANDOFF ${item}`);
  }

  return lines.join("\n");
}

async function main() {
  const summary = runExternalBlockerReadiness();
  console.log(JSON.stringify(summary, null, 2));
  console.log(`SUMMARY_JSON ${JSON.stringify(summary)}`);
  console.log(formatExternalBlockerReadinessSummary(summary));
  process.exitCode = chooseExternalBlockerReadinessExitCode(summary);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
