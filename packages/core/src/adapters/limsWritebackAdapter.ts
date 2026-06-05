import type { FetchLike } from "../providers/providerTypes";

export interface LimsWritebackFieldPayload {
  sourceFieldKey: string;
  targetFieldKey: string;
  value: string | number | boolean | string[] | null;
}

export interface LimsWritebackRequestPayload {
  id: string;
  recognitionResultId: string;
  limsSampleId: string;
  requestedByUserId: string;
  requestedAt: string;
  fields: LimsWritebackFieldPayload[];
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface LimsWritebackExecutionResult {
  id: string;
  requestId: string;
  status: "pending" | "success" | "failed" | "partial";
  externalReceiptId?: string;
  errorMessage?: string;
  completedAt?: string;
  retryable: boolean;
}

export interface LimsWritebackResponseMapping {
  statusPath?: string;
  successValue?: string;
  receiptIdPath?: string;
  errorMessagePath?: string;
  retryablePath?: string;
}

export interface LimsWritebackAdapterConfig {
  endpoint: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  idempotencyKeyHeader?: string;
  responseMapping?: LimsWritebackResponseMapping;
  fetchFn?: FetchLike;
}

export interface LimsWritebackAdapter {
  execute(input: LimsWritebackRequestPayload): Promise<LimsWritebackExecutionResult>;
}

function getValueByPath(input: unknown, path: string | undefined): unknown {
  if (!path) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, input);
}

function buildBody(input: LimsWritebackRequestPayload): Record<string, unknown> {
  // 这里显式保留 requestId / recognitionResultId / limsSampleId，
  // 方便后续对接真实 LIMS 网关时做幂等和审计串联。
  return {
    requestId: input.id,
    recognitionResultId: input.recognitionResultId,
    limsSampleId: input.limsSampleId,
    requestedByUserId: input.requestedByUserId,
    requestedAt: input.requestedAt,
    fields: input.fields,
    payload: input.payload
  };
}

function createFailureResult(
  input: LimsWritebackRequestPayload,
  retryable: boolean,
  errorMessage: string
): LimsWritebackExecutionResult {
  return {
    id: `${input.id}:result`,
    requestId: input.id,
    status: "failed",
    errorMessage,
    retryable
  };
}

function shouldRetry(attempt: number, maxRetries: number, retryable: boolean): boolean {
  return retryable && attempt < maxRetries;
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createLimsWritebackAdapter(config: LimsWritebackAdapterConfig): LimsWritebackAdapter {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const maxRetries = config.maxRetries ?? 1;
  const retryDelayMs = config.retryDelayMs ?? 200;
  const method = config.method ?? "POST";
  const idempotencyKeyHeader = config.idempotencyKeyHeader ?? "X-Idempotency-Key";
  const mapping = config.responseMapping ?? {};

  return {
    async execute(input) {
      const idempotencyKey = input.idempotencyKey ?? input.id;

      for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchFn(config.endpoint, {
            method,
            headers: {
              "content-type": "application/json",
              [idempotencyKeyHeader]: idempotencyKey,
              ...config.headers
            },
            body: JSON.stringify(buildBody(input)),
            signal: controller.signal
          });

          let data: unknown;
          try {
            data = (await response.json()) as unknown;
          } catch {
            data = undefined;
          }

          const statusValue = getValueByPath(data, mapping.statusPath);
          const successValue = mapping.successValue ?? "success";
          const errorMessage =
            (getValueByPath(data, mapping.errorMessagePath) as string | undefined) ??
            `LIMS writeback failed with HTTP ${response.status}`;
          const retryable =
            typeof getValueByPath(data, mapping.retryablePath) === "boolean"
              ? (getValueByPath(data, mapping.retryablePath) as boolean)
              : response.status >= 500;

          if (response.ok && (statusValue === undefined || statusValue === successValue)) {
            const result: LimsWritebackExecutionResult = {
              id: `${input.id}:result`,
              requestId: input.id,
              status: "success",
              retryable: false
            };
            const receiptId = getValueByPath(data, mapping.receiptIdPath);
            if (typeof receiptId === "string") {
              result.externalReceiptId = receiptId;
            }

            return result;
          }

          if (shouldRetry(attempt, maxRetries, retryable)) {
            await sleep(retryDelayMs);
            continue;
          }

          return createFailureResult(input, retryable, errorMessage);
        } catch {
          const retryable = true;
          if (shouldRetry(attempt, maxRetries, retryable)) {
            await sleep(retryDelayMs);
            continue;
          }

          return createFailureResult(input, retryable, "LIMS writeback request failed");
        } finally {
          clearTimeout(timeout);
        }
      }
    }
  };
}
