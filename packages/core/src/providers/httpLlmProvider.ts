import { parseModelExtractionOutput } from "../engine/extractionEngine";
import {
  ProviderError,
  type HttpLlmProviderConfig,
  type ModelProvider
} from "./providerTypes";
import { fetch as undiciFetch } from "undici";

function createMalformedModelOutputError(providerName: string): ProviderError {
  return new ProviderError(`模型结构化输出无效：${providerName} 返回内容不符合字段抽取 schema`, {
    providerName,
    retryable: false,
    code: "MODEL_OUTPUT_MALFORMED"
  });
}

function createRetryableModelError(providerName: string, cause?: unknown): ProviderError {
  return new ProviderError(`模型调用失败：${providerName} 返回脱敏错误`, {
    providerName,
    retryable: true,
    code: "MODEL_PROVIDER_RETRYABLE_FAILURE",
    cause
  });
}

function getFirstChoiceContent(data: unknown): unknown {
  if (data === null || typeof data !== "object") {
    return undefined;
  }

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (firstChoice === null || typeof firstChoice !== "object") {
    return undefined;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (message === null || typeof message !== "object") {
    return undefined;
  }

  return (message as { content?: unknown }).content;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 收集请求中的所有图片 base64（images 优先，回退 imageBase64）。
 * 返回 null 表示无图片。
 */
function collectImages(request: { images?: string[]; imageBase64?: string }): string[] | null {
  if (request.images && request.images.length > 0) {
    return request.images;
  }
  if (request.imageBase64 && request.imageBase64.length > 0) {
    return [request.imageBase64];
  }
  return null;
}

export function createHttpLlmProvider(config: HttpLlmProviderConfig): ModelProvider {
  const providerName = config.providerName ?? "http-llm";
  const fetchFn = config.fetchFn ?? undiciFetch;
  const supportsJsonMode = config.supportsJsonMode ?? false;
  const maxRetries = config.maxRetries ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 1000;
  return {
    providerName,
    async extractFields(request) {
      // Vision 请求（带图片）需要更长超时；多图按图数动态加时，每图额外 120s，下限 300s
      const images = collectImages(request);
      const hasImage = images !== null;
      const timeoutMs = hasImage
        ? Math.max(600_000, images!.length * 120_000)
        : (config.timeoutMs ?? 120_000);
      console.log(`[extractFields] 开始调用 ${providerName}, hasImage=${hasImage}, timeout=${timeoutMs}ms`);

      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const bodySize = JSON.stringify({
            model: config.model,
            messages: [{ role: "user", content: hasImage ? "[image+text]" : request.prompt.slice(0, 100) }]
          }).length;
          const bodyObj = {
            model: config.model,
            messages: [
              {
                role: "system",
                content: hasImage
                  ? "你是病历字段结构化抽取模型，只能返回 JSON 对象。你会仔细查看文档图片，准确识别勾选框状态和手写内容。"
                  : "你是病历字段结构化抽取模型，只能返回 JSON 对象。"
              },
              {
                role: "user",
                content: hasImage
                  ? [
                      { type: "text", text: request.prompt },
                      ...images!.map((img) => ({
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${img}`
                          // detail: "high" removed to reduce request body size
                        }
                      }))
                    ]
                  : request.prompt
              }
            ],
            // response_format: 只在模型支持时启用（doubao支持，kimi-k26不支持）
            ...(supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
          };
          const bodyStr = JSON.stringify(bodyObj);
          console.log(`[extractFields] 实际请求体大小: ${(bodyStr.length / 1024).toFixed(1)}KB, prompt长度=${request.prompt.length}`);
          const response = await fetchFn(config.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              ...config.headers
            },
            body: bodyStr,
            signal: controller.signal
          });
          console.log(`[extractFields] 收到响应: status=${response.status}, ok=${response.ok}`);

          if (!response.ok) {
            if (isRetryableStatus(response.status) && attempt < maxRetries) {
              await delay(retryDelayMs * Math.pow(2, attempt));
              continue;
            }
            throw createRetryableModelError(providerName);
          }

          let data: unknown;
          try {
            data = (await response.json()) as unknown;
          } catch {
            throw createMalformedModelOutputError(providerName);
          }

          const content = getFirstChoiceContent(data);
          const candidates = parseModelExtractionOutput(content, request.schema);
          if (!candidates) {
            throw createMalformedModelOutputError(providerName);
          }

          return {
            providerName,
            candidates,
            raw: {
              // raw 只保留模型网关形态，不透传完整响应，避免模型复述 OCR 原文后被上层日志保存。
              providerMode: "openai-compatible-chat"
            }
          };
        } catch (error) {
          clearTimeout(timeout);
          console.log(`[extractFields] 错误: attempt=${attempt}, error=${error instanceof Error ? error.message : String(error)}`);
          lastError = error;

          if (error instanceof ProviderError && !error.retryable) {
            throw error;
          }

          // Network errors and retryable ProviderErrors
          if (!(error instanceof ProviderError) || error.retryable) {
            if (attempt < maxRetries) {
              await delay(retryDelayMs * Math.pow(2, attempt));
              continue;
            }
          }

          if (error instanceof ProviderError) {
            throw error;
          }
          throw createRetryableModelError(providerName, error);
        } finally {
          clearTimeout(timeout);
        }
      }

      // All retries exhausted
      if (lastError instanceof ProviderError) {
        throw lastError;
      }
      throw createRetryableModelError(providerName, lastError);
    }
  };
}
