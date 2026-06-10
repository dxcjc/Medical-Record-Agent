import { createHash } from "node:crypto";

export type ProductionSmokeMode = "blocked" | "failed" | "mock-production" | "real-sandbox";

export interface ProductionSmokeConfig {
  mode: Exclude<ProductionSmokeMode, "blocked" | "failed">;
  baseUrl: string;
  email: string;
  password: string;
  expectedServiceMode: string;
  runRecognition: boolean;
  runWriteback: boolean;
  jobPollIntervalMs: number;
  jobPollTimeoutMs: number;
  schemaKey: string;
  ocrProviderKey?: string;
  providerKey?: string;
  syntheticFileName: string;
  syntheticMimeType: string;
  syntheticContentBase64: string;
}

export interface ProductionSmokeStep {
  name: string;
  ok: boolean;
  status?: "ok" | "failed" | "blocked" | "skipped";
  detail?: string;
  code?: string;
  missingKeys?: string[];
  provider?: string;
  adapter?: string;
  requiredExternal?: string[];
  nextAction?: string;
  requiredChecks?: string[];
}

export interface ProductionSmokeReport {
  mode: ProductionSmokeMode;
  steps: ProductionSmokeStep[];
}

export type ProductionSmokeStatus = "passed" | "blocked" | "failed";

export interface ProductionSmokeMachineSummary {
  mode: ProductionSmokeMode;
  status: ProductionSmokeStatus;
  blockedSteps: Array<{
    name: string;
    code?: string;
    missingKeys?: string[];
    provider?: string;
    adapter?: string;
    requiredExternal?: string[];
    nextAction?: string;
    requiredChecks?: string[];
  }>;
  failedSteps: Array<{
    name: string;
    code?: string;
  }>;
}

export class ProductionSmokeConfigurationBlockedError extends Error {
  readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(`production smoke blocked: missing required environment ${missingKeys.join(", ")}`);
    this.name = "ProductionSmokeConfigurationBlockedError";
    this.missingKeys = missingKeys;
  }
}

function normalizeEntrypointPath(value: string) {
  if (value.startsWith("file://")) {
    try {
      const pathname = decodeURIComponent(new URL(value).pathname);
      return normalizeEntrypointPath(pathname);
    } catch {
      return value;
    }
  }

  const normalized = value.replace(/\\/g, "/");

  return /^\/[A-Za-z]:\//u.test(normalized) ? normalized.slice(1) : normalized;
}

export function isCliEntrypoint(moduleUrl: string, argvPath: string | undefined) {
  return argvPath !== undefined && normalizeEntrypointPath(moduleUrl) === normalizeEntrypointPath(argvPath);
}

function readBoolean(value: string | undefined) {
  return value === "1" || value === "true" || value === "TRUE";
}

function readSmokeMode(env: Record<string, string | undefined>): Exclude<ProductionSmokeMode, "blocked" | "failed"> {
  return env.PRODUCTION_SMOKE_MODE === "mock-production" ? "mock-production" : "real-sandbox";
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readOptionalEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return value && value.length > 0 ? value : undefined;
}

function requireEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} 未配置，无法执行 production smoke。`);
  }

  return value;
}

function buildDefaultSyntheticContentBase64() {
  return Buffer.from("病历摘要：患者，男，60岁。临床诊断：肺腺癌。样本类型：组织。", "utf8").toString(
    "base64"
  );
}

function collectMissingProductionSmokeEnv(env: Record<string, string | undefined>) {
  return ["PRODUCTION_SMOKE_BASE_URL", "PRODUCTION_SMOKE_EMAIL", "PRODUCTION_SMOKE_PASSWORD"].filter(
    (key) => !readOptionalEnvValue(env, key)
  );
}

export function buildProductionSmokeBlockedReport(env: Record<string, string | undefined> = process.env): ProductionSmokeReport | null {
  if (readSmokeMode(env) === "mock-production") {
    return null;
  }

  const missingKeys = collectMissingProductionSmokeEnv(env);
  if (missingKeys.length === 0) {
    return null;
  }

  return {
    mode: "blocked",
    steps: [
      {
        name: "configuration",
        ok: false,
        status: "blocked",
        code: "PRODUCTION_SMOKE_CONFIGURATION_MISSING",
        missingKeys,
        nextAction:
          "配置 PRODUCTION_SMOKE_MODE=real-sandbox、真实 sandbox base URL 与账号后重跑 corepack pnpm smoke:production。",
        requiredChecks: [
          "real-external-api-login",
          "real-provider-sandbox-connectivity-smoke",
          "real-ocr-llm-lims-sandbox-smoke",
          "writeback-readyFields-only-smoke"
        ],
        detail: `external sandbox blocked: 缺少 ${missingKeys.join(", ")}；配置 PRODUCTION_SMOKE_MODE=real-sandbox 与真实 sandbox 后才会执行真实外部 API/OCR/LLM/LIMS smoke。`
      },
      {
        name: "secret-resolver",
        ok: false,
        status: "blocked",
        code: "SECRET_RESOLVER_ENV_ONLY",
        provider: "env",
        requiredExternal: ["KMS", "Vault", "Secret Manager"],
        nextAction:
          "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
        requiredChecks: [
          "external-secret-resolution-smoke",
          "provider-health-secretRefs-smoke",
          "provider-response-secret-redaction-smoke",
          "provider-health-secret-redaction-smoke",
          "audit-metadata-secret-redaction-smoke"
        ],
        detail:
          "secret resolver blocked: SECRET_RESOLVER_ENV_ONLY；当前 env resolver 不能代表生产 KMS/Vault/Secret Manager。设置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK 后才可解除。"
      },
      {
        name: "session-invalidation-store",
        ok: false,
        status: "blocked",
        code: "SESSION_INVALIDATION_STORE_IN_MEMORY",
        adapter: "in-memory",
        nextAction:
          "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ],
        detail:
          "session invalidation store blocked: SESSION_INVALIDATION_STORE_IN_MEMORY；当前进程内失效集合不能代表生产多实例 session invalidation store。设置 SESSION_INVALIDATION_STORE_MODE=repository 并接入数据库/Redis 与多实例 smoke 后才可解除。"
      },
      {
        name: "queue-broker",
        ok: false,
        status: "blocked",
        code: "QUEUE_BROKER_NOT_CONFIGURED",
        adapter: "not-configured",
        nextAction:
          "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
        requiredChecks: [
          "multi-worker-lease-smoke",
          "retry-dead-letter-smoke",
          "heartbeat-status-consistency-smoke",
          "status-result-consistency-smoke",
          "idempotency-key-deduplication-smoke"
        ],
        detail:
          "queue broker blocked: QUEUE_BROKER_NOT_CONFIGURED；设置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS、worker 绑定、lease/retry/dead-letter/heartbeat/status-result consistency、idempotency 和多实例 smoke 后才可解除。"
      }
    ]
  };
}

export function buildProductionSmokeConfig(env: Record<string, string | undefined> = process.env): ProductionSmokeConfig {
  const mode = readSmokeMode(env);
  const runWriteback = readBoolean(env.PRODUCTION_SMOKE_RUN_WRITEBACK);

  if (mode === "mock-production") {
    return {
      mode,
      baseUrl: readOptionalEnvValue(env, "PRODUCTION_SMOKE_BASE_URL")?.replace(/\/$/, "") ?? "http://mock-production.local",
      email: readOptionalEnvValue(env, "PRODUCTION_SMOKE_EMAIL") ?? "mock-production@example.local",
      password: readOptionalEnvValue(env, "PRODUCTION_SMOKE_PASSWORD") ?? "MockProduction123!",
      expectedServiceMode: env.PRODUCTION_SMOKE_EXPECTED_MODE ?? "production",
      runRecognition: true,
      runWriteback,
      jobPollIntervalMs: readPositiveInteger(env.PRODUCTION_SMOKE_JOB_POLL_INTERVAL_MS, 0),
      jobPollTimeoutMs: readPositiveInteger(env.PRODUCTION_SMOKE_JOB_POLL_TIMEOUT_MS, 1000),
      schemaKey: env.PRODUCTION_SMOKE_SCHEMA_KEY ?? "lims-clinical-info",
      syntheticFileName: env.PRODUCTION_SMOKE_SYNTHETIC_FILE_NAME ?? "production-smoke-medical-record.txt",
      syntheticMimeType: env.PRODUCTION_SMOKE_SYNTHETIC_MIME_TYPE ?? "text/plain",
      syntheticContentBase64: env.PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64 ?? buildDefaultSyntheticContentBase64()
    };
  }

  const missingKeys = collectMissingProductionSmokeEnv(env);
  if (missingKeys.length > 0) {
    throw new ProductionSmokeConfigurationBlockedError(missingKeys);
  }

  const config: ProductionSmokeConfig = {
    mode,
    baseUrl: requireEnvValue(env, "PRODUCTION_SMOKE_BASE_URL").replace(/\/$/, ""),
    email: requireEnvValue(env, "PRODUCTION_SMOKE_EMAIL"),
    password: requireEnvValue(env, "PRODUCTION_SMOKE_PASSWORD"),
    expectedServiceMode: env.PRODUCTION_SMOKE_EXPECTED_MODE ?? "production",
    // 写回 smoke 只能基于本次新建的合成识别任务执行；因此打开写回时自动把识别链路纳入同一次 smoke。
    runRecognition: readBoolean(env.PRODUCTION_SMOKE_RUN_RECOGNITION) || runWriteback,
    runWriteback,
    jobPollIntervalMs: readPositiveInteger(env.PRODUCTION_SMOKE_JOB_POLL_INTERVAL_MS, 1000),
    jobPollTimeoutMs: readPositiveInteger(env.PRODUCTION_SMOKE_JOB_POLL_TIMEOUT_MS, 120_000),
    schemaKey: env.PRODUCTION_SMOKE_SCHEMA_KEY ?? "lims-clinical-info",
    syntheticFileName: env.PRODUCTION_SMOKE_SYNTHETIC_FILE_NAME ?? "production-smoke-medical-record.txt",
    syntheticMimeType: env.PRODUCTION_SMOKE_SYNTHETIC_MIME_TYPE ?? "text/plain",
    syntheticContentBase64: env.PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64 ?? buildDefaultSyntheticContentBase64()
  };
  const ocrProviderKey = readOptionalEnvValue(env, "PRODUCTION_SMOKE_OCR_PROVIDER_KEY");
  const providerKey = readOptionalEnvValue(env, "PRODUCTION_SMOKE_PROVIDER_KEY");

  if (ocrProviderKey !== undefined) {
    config.ocrProviderKey = ocrProviderKey;
  }

  if (providerKey !== undefined) {
    config.providerKey = providerKey;
  }

  return config;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  return text.length > 0 ? (JSON.parse(text) as unknown) : {};
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function readNestedArray(value: unknown, path: string[]) {
  let cursor: unknown = value;

  for (const key of path) {
    cursor = readRecord(cursor)[key];
  }

  return readArray(cursor);
}

function buildStatusDependencySteps(statusPayload: Record<string, unknown>): ProductionSmokeStep[] {
  const runtime = readRecord(statusPayload.runtime);
  const secretResolver = readRecord(runtime.secretResolver);
  const sessionInvalidationStore = readRecord(runtime.sessionInvalidationStore);
  const queue = readRecord(runtime.queue);
  const steps: ProductionSmokeStep[] = [];

  if (Object.keys(secretResolver).length > 0 && secretResolver.productionReady !== true) {
    const provider = readString(secretResolver.provider) ?? "unknown";
    const blockedReason = readString(secretResolver.blockedReason) ?? "SECRET_RESOLVER_NOT_PRODUCTION_READY";
    const requiredExternal = readArray(secretResolver.requiredExternal)
      ?.filter((item): item is string => typeof item === "string" && item.length > 0)
      .join("/");

    steps.push({
      name: "secret-resolver",
      ok: false,
      status: "blocked",
      code: blockedReason,
      provider,
      requiredExternal: requiredExternal ? requiredExternal.split("/") : ["KMS", "Vault", "Secret Manager"],
      nextAction:
        "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
      requiredChecks: [
        "external-secret-resolution-smoke",
        "provider-health-secretRefs-smoke",
        "provider-response-secret-redaction-smoke",
        "provider-health-secret-redaction-smoke",
        "audit-metadata-secret-redaction-smoke"
      ],
      detail: `${blockedReason} provider=${provider}${
        requiredExternal ? ` requiredExternal=${requiredExternal}` : ""
      }；真实 KMS/Vault/Secret Manager 未验证。`
    });
  }

  if (Object.keys(sessionInvalidationStore).length > 0 && sessionInvalidationStore.productionReady !== true) {
    const adapter = readString(sessionInvalidationStore.adapter) ?? "unknown";
    const blockedReason =
      readString(sessionInvalidationStore.blockedReason) ?? "SESSION_INVALIDATION_STORE_NOT_PRODUCTION_READY";

    steps.push({
      name: "session-invalidation-store",
      ok: false,
      status: "blocked",
      code: blockedReason,
      adapter,
      nextAction:
        "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
      requiredChecks: [
        "two-instance-session-invalidation-smoke",
        "token-hash-ttl-verification",
        "raw-token-not-persisted-check",
        "login-rotation-cross-instance-smoke"
      ],
      detail: `${blockedReason} adapter=${adapter}；生产多实例 session invalidation store 未验证。`
    });
  }

  if (Object.keys(queue).length > 0 && queue.productionReady !== true) {
    const adapter = readString(queue.adapter) ?? "unknown";
    const blockedReason = readString(queue.blockedReason) ?? "QUEUE_BROKER_NOT_PRODUCTION_READY";

    steps.push({
      name: "queue-broker",
      ok: false,
      status: "blocked",
      code: blockedReason,
      adapter,
      nextAction:
        "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
      requiredChecks: [
        "multi-worker-lease-smoke",
        "retry-dead-letter-smoke",
        "heartbeat-status-consistency-smoke",
        "status-result-consistency-smoke",
        "idempotency-key-deduplication-smoke"
      ],
      detail: `${blockedReason} adapter=${adapter}；真实 broker 多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke 未验证。`
    });
  }

  return steps;
}

function createJsonAuthHeaders(token: string) {
  return new Headers({
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  });
}

function createProviderConfig(config: ProductionSmokeConfig) {
  const providerConfig: Record<string, string> = {};

  if (config.ocrProviderKey) {
    providerConfig.ocrProviderKey = config.ocrProviderKey;
  }

  if (config.providerKey) {
    providerConfig.providerKey = config.providerKey;
  }

  return Object.keys(providerConfig).length > 0 ? providerConfig : undefined;
}

function checksumSha256FromBase64(contentBase64: string) {
  return createHash("sha256").update(Buffer.from(contentBase64, "base64")).digest("hex");
}

function extractReadyFields(resultPayload: Record<string, unknown>) {
  return (
    readNestedArray(resultPayload, ["payload", "writeback", "readyFields"]) ??
    readNestedArray(resultPayload, ["writeback", "readyFields"]) ??
    readArray(resultPayload.readyFields) ??
    []
  );
}

function isTerminalJobStatus(status: string) {
  return [
    "completed",
    "partial_completed",
    "needs_review",
    "writeback_completed",
    "writeback_failed",
    "failed"
  ].includes(status);
}

function sleep(ms: number) {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  stepName: string
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`${stepName} 返回 HTTP ${response.status}`);
  }

  return payload;
}

async function pollRecognitionJob(input: {
  config: ProductionSmokeConfig;
  fetchImpl: typeof fetch;
  baseUrl: string;
  token: string;
  jobId: string;
  steps: ProductionSmokeStep[];
}) {
  const startedAt = Date.now();
  let lastPayload: Record<string, unknown> = {};

  while (Date.now() - startedAt <= input.config.jobPollTimeoutMs) {
    lastPayload = readRecord(
      await requestJson(
        input.fetchImpl,
        `${input.baseUrl}/jobs/${encodeURIComponent(input.jobId)}`,
        {
          method: "GET",
          headers: new Headers({
            authorization: `Bearer ${input.token}`
          })
        },
        "job-read"
      )
    );
    const status = readString(lastPayload.status) ?? "unknown";
    input.steps.push({ name: "job-read", ok: true, detail: `status=${status}` });

    if (status === "failed" || status === "writeback_failed") {
      throw new Error(`job-read 任务状态为 ${status}。`);
    }

    if (isTerminalJobStatus(status)) {
      return lastPayload;
    }

    await sleep(input.config.jobPollIntervalMs);
  }

  const status = readString(lastPayload.status) ?? "unknown";
  throw new Error(`job-read 轮询超时，最后状态为 ${status}。`);
}

async function runRecognitionSmoke(input: {
  config: ProductionSmokeConfig;
  fetchImpl: typeof fetch;
  baseUrl: string;
  token: string;
  steps: ProductionSmokeStep[];
}) {
  const uploadPayload = readRecord(
    await requestJson(
      input.fetchImpl,
      `${input.baseUrl}/files`,
      {
        method: "POST",
        headers: createJsonAuthHeaders(input.token),
        body: JSON.stringify({
          originalName: input.config.syntheticFileName,
          mimeType: input.config.syntheticMimeType,
          contentBase64: input.config.syntheticContentBase64,
          checksumSha256: checksumSha256FromBase64(input.config.syntheticContentBase64),
          metadata: {
            source: "production-smoke",
            synthetic: true
          }
        })
      },
      "file-upload"
    )
  );
  const fileId = readString(uploadPayload.id);
  if (!fileId) {
    throw new Error("file-upload 未返回文件 id。");
  }
  input.steps.push({ name: "file-upload", ok: true, detail: `fileId=${fileId}` });

  const jobBody: Record<string, unknown> = {
    schemaKey: input.config.schemaKey,
    sourceFileId: fileId
  };
  const providerConfig = createProviderConfig(input.config);
  if (providerConfig) {
    jobBody.providerConfig = providerConfig;
  }

  const jobPayload = readRecord(
    await requestJson(
      input.fetchImpl,
      `${input.baseUrl}/jobs`,
      {
        method: "POST",
        headers: createJsonAuthHeaders(input.token),
        body: JSON.stringify(jobBody)
      },
      "recognition-job"
    )
  );
  const jobId = readString(jobPayload.id);
  if (!jobId) {
    throw new Error("recognition-job 未返回任务 id。");
  }
  input.steps.push({
    name: "recognition-job",
    ok: true,
    detail: `jobId=${jobId}${readString(jobPayload.status) ? ` status=${readString(jobPayload.status)}` : ""}`
  });

  await pollRecognitionJob({
    config: input.config,
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    token: input.token,
    jobId,
    steps: input.steps
  });

  const resultPayload = readRecord(
    await requestJson(
      input.fetchImpl,
      `${input.baseUrl}/results/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: new Headers({
          authorization: `Bearer ${input.token}`
        })
      },
      "result-read"
    )
  );
  input.steps.push({ name: "result-read", ok: true, detail: `jobId=${jobId}` });

  return {
    jobId,
    resultPayload
  };
}

async function runWritebackSmoke(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  token: string;
  jobId: string;
  resultPayload: Record<string, unknown>;
  steps: ProductionSmokeStep[];
}) {
  const readyFields = extractReadyFields(input.resultPayload);
  if (readyFields.length === 0) {
    throw new Error("writeback smoke 未在识别结果中发现 payload.writeback.readyFields。");
  }

  const writebackPayload = readRecord(
    await requestJson(
      input.fetchImpl,
      `${input.baseUrl}/writeback`,
      {
        method: "POST",
        headers: createJsonAuthHeaders(input.token),
        body: JSON.stringify({
          jobId: input.jobId,
          confirmed: true,
          idempotencyKey: `production-smoke:${input.jobId}`
        })
      },
      "writeback"
    )
  );
  input.steps.push({
    name: "writeback",
    ok: true,
    detail: readString(writebackPayload.status) ?? readString(writebackPayload.id) ?? "submitted"
  });
}

export async function runProductionSmoke(
  config: ProductionSmokeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ProductionSmokeReport> {
  const steps: ProductionSmokeStep[] = [];
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  const statusPayload = readRecord(
    await requestJson(fetchImpl, `${baseUrl}/status`, { method: "GET" }, "status")
  );
  const runtime = readRecord(statusPayload.runtime);
  const serviceMode = readString(runtime.serviceMode);
  if (serviceMode !== config.expectedServiceMode) {
    throw new Error(`status serviceMode=${serviceMode ?? "unknown"}，期望 ${config.expectedServiceMode}`);
  }
  steps.push({ name: "status", ok: true, detail: `serviceMode=${serviceMode}` });
  steps.push(...buildStatusDependencySteps(statusPayload));

  const loginPayload = readRecord(
    await requestJson(
      fetchImpl,
      `${baseUrl}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: config.email,
          password: config.password
        })
      },
      "login"
    )
  );
  const token = readString(loginPayload.accessToken);
  if (!token) {
    throw new Error("login 未返回 accessToken。");
  }
  steps.push({ name: "login", ok: true });

  const authHeaders = new Headers({
    authorization: `Bearer ${token}`
  });
  const providersPayload = readRecord(
    await requestJson(fetchImpl, `${baseUrl}/providers`, { method: "GET", headers: authHeaders }, "providers")
  );
  const providers = Array.isArray(providersPayload.items) ? providersPayload.items : [];
  steps.push({ name: "providers", ok: true, detail: `${providers.length} providers` });

  for (const provider of providers) {
    const key = readString(readRecord(provider).key);
    if (!key) {
      continue;
    }

    const healthPayload = readRecord(
      await requestJson(
        fetchImpl,
        `${baseUrl}/providers/${encodeURIComponent(key)}/health`,
        { method: "POST", headers: authHeaders },
        `provider-health:${key}`
      )
    );
    const health = readRecord(healthPayload.health);
    const healthStatus = readString(health.status) ?? "unknown";
    const blockedReason = readString(health.blockedReason);
    steps.push({
      name: `provider-health:${key}`,
      ok: healthStatus === "healthy" || healthStatus === "degraded",
      ...(healthStatus === "blocked"
        ? {
            status: "blocked" as const,
            code: blockedReason ?? "PROVIDER_HEALTH_BLOCKED",
            provider: key,
            nextAction: "修复该 provider 的 secretRefs、sandbox endpoint 或外部服务连通性后重跑 provider health 与 production smoke。",
            requiredChecks: ["provider-health-secretRefs-smoke", "real-provider-sandbox-connectivity-smoke"]
          }
        : {}),
      detail: healthStatus === "blocked" ? (blockedReason ?? "blocked") : healthStatus
    });
  }

  const recognition = config.runRecognition
    ? await runRecognitionSmoke({
        config,
        fetchImpl,
        baseUrl,
        token,
        steps
      })
    : undefined;

  if (config.runWriteback) {
    if (!recognition) {
      throw new Error("PRODUCTION_SMOKE_RUN_WRITEBACK 需要先执行识别 smoke。");
    }

    await runWritebackSmoke({
      fetchImpl,
      baseUrl,
      token,
      jobId: recognition.jobId,
      resultPayload: recognition.resultPayload,
      steps
    });
  }

  return { mode: config.mode, steps };
}

export async function runProductionSmokeSafely(
  config: ProductionSmokeConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ProductionSmokeReport> {
  try {
    const report = await runProductionSmoke(config, fetchImpl);
    return {
      ...report,
      steps: report.steps.map((step) => ({
        status: step.ok ? ("ok" as const) : step.status ?? ("failed" as const),
        ...step
      }))
    };
  } catch (error) {
    return {
      mode: "failed",
      steps: [
        {
          name: "production-smoke",
          ok: false,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}

export function classifyProductionSmokeReport(report: ProductionSmokeReport): ProductionSmokeStatus {
  if (report.mode === "blocked" || report.steps.some((step) => step.status === "blocked")) {
    return "blocked";
  }

  if (report.mode === "failed" || report.steps.some((step) => !step.ok || step.status === "failed")) {
    return "failed";
  }

  return "passed";
}

function inferBlockedStepCode(step: ProductionSmokeStep) {
  if (step.code) {
    return step.code;
  }

  const detail = step.detail ?? "";
  const explicitCode = detail.match(/\b[A-Z][A-Z0-9_]{2,}\b/u)?.[0];
  return explicitCode;
}

function inferBlockedStepProvider(step: ProductionSmokeStep) {
  if (step.provider) {
    return step.provider;
  }

  const providerMatch = step.detail?.match(/\bprovider=([^\s；]+)/u);
  return providerMatch?.[1];
}

function inferBlockedStepAdapter(step: ProductionSmokeStep) {
  if (step.adapter) {
    return step.adapter;
  }

  const adapterMatch = step.detail?.match(/\badapter=([^\s；]+)/u);
  return adapterMatch?.[1];
}

function inferBlockedRequiredExternal(step: ProductionSmokeStep) {
  if (step.requiredExternal) {
    return step.requiredExternal;
  }

  const requiredExternalMatch = step.detail?.match(/\brequiredExternal=([^；]+)/u);
  return requiredExternalMatch?.[1]?.split("/").filter((item) => item.length > 0);
}

export function buildProductionSmokeMachineSummary(report: ProductionSmokeReport): ProductionSmokeMachineSummary {
  return {
    mode: report.mode,
    status: classifyProductionSmokeReport(report),
    blockedSteps: report.steps
      .filter((step) => step.status === "blocked")
      .map((step) => {
        const blockedStep: ProductionSmokeMachineSummary["blockedSteps"][number] = {
          name: step.name
        };
        const code = inferBlockedStepCode(step);
        const provider = inferBlockedStepProvider(step);
        const adapter = inferBlockedStepAdapter(step);
        const requiredExternal = inferBlockedRequiredExternal(step);

        if (code) {
          blockedStep.code = code;
        }
        if (step.missingKeys) {
          blockedStep.missingKeys = step.missingKeys;
        }
        if (provider) {
          blockedStep.provider = provider;
        }
        if (adapter) {
          blockedStep.adapter = adapter;
        }
        if (requiredExternal) {
          blockedStep.requiredExternal = requiredExternal;
        }
        if (step.nextAction) {
          blockedStep.nextAction = step.nextAction;
        }
        if (step.requiredChecks) {
          blockedStep.requiredChecks = step.requiredChecks;
        }

        return blockedStep;
      }),
    failedSteps: report.steps
      .filter((step) => step.status === "failed" || (!step.ok && step.status !== "blocked"))
      .map((step) => {
        const failedStep: ProductionSmokeMachineSummary["failedSteps"][number] = {
          name: step.name
        };
        const code = inferBlockedStepCode(step);
        if (code) {
          failedStep.code = code;
        }

        return failedStep;
      })
  };
}

export function formatProductionSmokeCliOutput(report: ProductionSmokeReport) {
  const status = classifyProductionSmokeReport(report);
  const lines = [`MODE ${report.mode}`, `STATUS ${status}`];

  for (const step of report.steps) {
    const label = step.status === "blocked" ? "BLOCKED" : step.status === "skipped" ? "SKIPPED" : step.ok ? "OK" : "FAIL";
    lines.push(`${label} ${step.name}${step.detail ? ` ${step.detail}` : ""}`);
    if (step.status === "blocked" && step.nextAction) {
      lines.push(`NEXT ${step.name} ${step.nextAction}`);
    }
    if (step.status === "blocked" && step.requiredChecks && step.requiredChecks.length > 0) {
      lines.push(`REQUIRED_CHECKS ${step.name} ${step.requiredChecks.join(",")}`);
    }
  }

  lines.push(`SUMMARY_JSON ${JSON.stringify(buildProductionSmokeMachineSummary(report))}`);

  return lines.join("\n");
}

function createMockProductionFetch(): typeof fetch {
  let jobReadCount = 0;

  return (async (url: string | URL, init?: RequestInit) => {
    const pathname = new URL(String(url)).pathname;

    if (pathname === "/status") {
      return jsonResponse({
        runtime: {
          serviceMode: "production"
        }
      });
    }

    if (pathname === "/auth/login") {
      return jsonResponse({
        accessToken: "mock-production.jwt"
      });
    }

    if (pathname === "/providers") {
      return jsonResponse({
        items: [
          { key: "fixture-ocr", kind: "ocr" },
          { key: "fixture-model", kind: "llm" }
        ]
      });
    }

    if (pathname === "/providers/fixture-ocr/health" || pathname === "/providers/fixture-model/health") {
      return jsonResponse({
        health: {
          status: "healthy"
        }
      });
    }

    if (pathname === "/files") {
      return jsonResponse({
        id: "file-mock-production-001"
      });
    }

    if (pathname === "/jobs") {
      return jsonResponse({
        id: "job-mock-production-001",
        status: "queued",
        executionMode: "asynchronous"
      });
    }

    if (pathname === "/jobs/job-mock-production-001") {
      jobReadCount += 1;
      return jsonResponse({
        id: "job-mock-production-001",
        status: jobReadCount > 1 ? "completed" : "running"
      });
    }

    if (pathname === "/results/job-mock-production-001") {
      return jsonResponse({
        jobId: "job-mock-production-001",
        payload: {
          writeback: {
            readyFields: [
              {
                fieldKey: "clinicalDiagnosis",
                targetPath: "clinicalInfo.clinicalDiagnosis",
                value: "肺腺癌"
              }
            ]
          }
        }
      });
    }

    if (pathname === "/writeback") {
      const body = readRecord(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse({
        id: "writeback-mock-production-001",
        status: body.confirmed === true ? "succeeded" : "failed"
      });
    }

    return jsonResponse({ error: "NOT_FOUND" }, 404);
  }) as typeof fetch;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export function runMockProductionContractSmoke(config: ProductionSmokeConfig): Promise<ProductionSmokeReport> {
  return runProductionSmoke(
    {
      ...config,
      mode: "mock-production",
      runRecognition: true
    },
    createMockProductionFetch()
  );
}

async function main() {
  const blockedReport = buildProductionSmokeBlockedReport();
  let report: ProductionSmokeReport;
  if (blockedReport) {
    report = blockedReport;
  } else {
    const config = buildProductionSmokeConfig();
    report =
      config.mode === "mock-production" ? await runMockProductionContractSmoke(config) : await runProductionSmokeSafely(config);
  }
  const status = classifyProductionSmokeReport(report);

  console.log(formatProductionSmokeCliOutput(report));

  if (status !== "passed") {
    process.exitCode = status === "blocked" ? 2 : 1;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    if (error instanceof ProductionSmokeConfigurationBlockedError) {
      console.error(`BLOCKED configuration 缺少 ${error.missingKeys.join(", ")}；production smoke 未执行。`);
      process.exitCode = 2;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
