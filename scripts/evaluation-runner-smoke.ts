import { isCliEntrypoint } from "./production-smoke";

export interface EvaluationRunConfig {
  baseUrl: string;
  accessToken: string;
  datasetId: string;
  providerKey: string;
  schemaKey?: string;
  sampleLimit?: number;
}

export interface EvaluationRunSmokeResult {
  runId: string;
  status: string;
  metricCount: number;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  if (!hasText(value)) {
    throw new Error(`${key} 未配置。`);
  }

  return value;
}

function readOptionalNumber(value: string | undefined) {
  if (!hasText(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildEvaluationRunConfig(env: Record<string, string | undefined> = process.env): EvaluationRunConfig {
  const config: EvaluationRunConfig = {
    baseUrl: requireEnvValue(env, "EVALUATION_API_BASE_URL").replace(/\/$/, ""),
    accessToken: requireEnvValue(env, "EVALUATION_API_ACCESS_TOKEN"),
    datasetId: requireEnvValue(env, "EVALUATION_DATASET_ID"),
    providerKey: requireEnvValue(env, "EVALUATION_PROVIDER_KEY")
  };

  if (hasText(env.EVALUATION_SCHEMA_KEY)) {
    config.schemaKey = env.EVALUATION_SCHEMA_KEY;
  }

  const sampleLimit = readOptionalNumber(env.EVALUATION_SAMPLE_LIMIT);
  if (sampleLimit !== undefined) {
    config.sampleLimit = sampleLimit;
  }

  return config;
}

function createAuthHeaders(accessToken: string) {
  return new Headers({
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json"
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return hasText(value) ? value : undefined;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  return text.length > 0 ? (JSON.parse(text) as unknown) : {};
}

async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit, stepName: string) {
  const response = await fetchImpl(url, init);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`${stepName} 返回 HTTP ${response.status}`);
  }

  return payload;
}

function readRunId(payload: unknown) {
  const run = isRecord(payload) ? payload.run : undefined;
  return isRecord(run) ? readString(run.id) : undefined;
}

function readRunStatus(payload: unknown) {
  const run = isRecord(payload) ? payload.run : undefined;
  return isRecord(run) ? readString(run.status) : undefined;
}

export async function runEvaluationApiSmoke(
  config: EvaluationRunConfig,
  fetchImpl: typeof fetch = fetch
): Promise<EvaluationRunSmokeResult> {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const runBody: Record<string, unknown> = {
    datasetId: config.datasetId,
    providerKey: config.providerKey
  };

  if (config.schemaKey !== undefined) {
    runBody.schemaKey = config.schemaKey;
  }

  if (config.sampleLimit !== undefined) {
    runBody.sampleLimit = config.sampleLimit;
  }

  const createRunPayload = await requestJson(
    fetchImpl,
    `${baseUrl}/evaluations/runs`,
    {
      method: "POST",
      headers: createAuthHeaders(config.accessToken),
      body: JSON.stringify(runBody)
    },
    "evaluation-run-create"
  );
  const runId = readRunId(createRunPayload);
  if (!runId) {
    throw new Error("evaluation-run-create 未返回 run.id。");
  }

  const runPayload = await requestJson(
    fetchImpl,
    `${baseUrl}/evaluations/runs/${encodeURIComponent(runId)}`,
    {
      method: "GET",
      headers: createAuthHeaders(config.accessToken)
    },
    "evaluation-run-read"
  );
  const status = readRunStatus(runPayload) ?? readRunStatus(createRunPayload) ?? "unknown";

  const metricsPayload = await requestJson(
    fetchImpl,
    `${baseUrl}/evaluations/runs/${encodeURIComponent(runId)}/metrics`,
    {
      method: "GET",
      headers: createAuthHeaders(config.accessToken)
    },
    "evaluation-run-metrics"
  );
  const metrics = isRecord(metricsPayload) && Array.isArray(metricsPayload.metrics) ? metricsPayload.metrics : [];

  return {
    runId,
    status,
    metricCount: metrics.length
  };
}

async function main() {
  const result = await runEvaluationApiSmoke(buildEvaluationRunConfig());
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result
      },
      null,
      2
    )
  );
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
