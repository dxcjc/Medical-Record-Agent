import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export interface ProductionSmokeConfig {
  baseUrl: string;
  email: string;
  password: string;
  expectedServiceMode: string;
  runRecognition: boolean;
  runWriteback: boolean;
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
  detail?: string;
}

export interface ProductionSmokeReport {
  steps: ProductionSmokeStep[];
}

export function isCliEntrypoint(moduleUrl: string, argvPath: string | undefined) {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href;
}

function readBoolean(value: string | undefined) {
  return value === "1" || value === "true" || value === "TRUE";
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

export function buildProductionSmokeConfig(env: Record<string, string | undefined> = process.env): ProductionSmokeConfig {
  const runWriteback = readBoolean(env.PRODUCTION_SMOKE_RUN_WRITEBACK);
  const config: ProductionSmokeConfig = {
    baseUrl: requireEnvValue(env, "PRODUCTION_SMOKE_BASE_URL").replace(/\/$/, ""),
    email: requireEnvValue(env, "PRODUCTION_SMOKE_EMAIL"),
    password: requireEnvValue(env, "PRODUCTION_SMOKE_PASSWORD"),
    expectedServiceMode: env.PRODUCTION_SMOKE_EXPECTED_MODE ?? "production",
    // 写回 smoke 只能基于本次新建的合成识别任务执行；因此打开写回时自动把识别链路纳入同一次 smoke。
    runRecognition: readBoolean(env.PRODUCTION_SMOKE_RUN_RECOGNITION) || runWriteback,
    runWriteback,
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

  const jobReadPayload = readRecord(
    await requestJson(
      input.fetchImpl,
      `${input.baseUrl}/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: new Headers({
          authorization: `Bearer ${input.token}`
        })
      },
      "job-read"
    )
  );
  const jobStatus = readString(jobReadPayload.status) ?? "unknown";
  if (jobStatus === "failed" || jobStatus === "writeback_failed") {
    throw new Error(`job-read 任务状态为 ${jobStatus}。`);
  }
  input.steps.push({ name: "job-read", ok: true, detail: `status=${jobStatus}` });

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
          fields: readyFields,
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
    steps.push({
      name: `provider-health:${key}`,
      ok: healthStatus === "healthy" || healthStatus === "degraded",
      detail: healthStatus
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

  return { steps };
}

async function main() {
  const report = await runProductionSmoke(buildProductionSmokeConfig());
  const failed = report.steps.filter((step) => !step.ok);

  for (const step of report.steps) {
    console.log(`${step.ok ? "OK" : "FAIL"} ${step.name}${step.detail ? ` ${step.detail}` : ""}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
