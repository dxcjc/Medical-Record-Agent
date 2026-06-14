import { parseModelExtractionOutput } from "../engine/extractionEngine";
import {
  ProviderError,
  type HttpLlmProviderConfig,
  type ModelProvider
} from "./providerTypes";

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

export function createHttpLlmProvider(config: HttpLlmProviderConfig): ModelProvider {
  const providerName = config.providerName ?? "http-llm";
  const fetchFn = config.fetchFn ?? fetch;
  const maxRetries = config.maxRetries ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 1000;
  return {
    providerName,
    async extractFields(request) {
      console.error(`[httpLlmProvider] extractFields 被调用, endpoint=${config.endpoint}, model=${config.model}`);
      // Vision 请求（带图片）需要更长超时
      const hasImage = request.imageBase64 && request.imageBase64.length > 0;
      const timeoutMs = hasImage ? 300_000 : (config.timeoutMs ?? 120_000);

      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchFn(config.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              ...config.headers
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                {
                  role: "system",
                  content: request.imageBase64
                    ? "你是病历字段结构化抽取模型，只能返回 JSON 对象。你会仔细查看文档图片，准确识别勾选框状态和手写内容。"
                    : "你是病历字段结构化抽取模型，只能返回 JSON 对象。"
                },
                {
                  role: "user",
                  content: request.imageBase64
                    ? [
                        { type: "text", text: request.prompt },
                        {
                          type: "image_url",
                          image_url: {
                            url: `data:image/jpeg;base64,${request.imageBase64}`,
                            detail: "high"
                          }
                        }
                      ]
                    : request.prompt
                }
              ],
              response_format: { type: "json_object" }
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            console.error(`[httpLlmProvider] HTTP 错误: ${response.status} ${response.statusText}, endpoint=${config.endpoint}`);
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
          console.error(`[httpLlmProvider] LLM 返回内容: ${typeof content === 'string' ? content.substring(0, 2000) : JSON.stringify(content)?.substring(0, 2000)}`);
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
          lastError = error;

          if (error instanceof ProviderError && !error.retryable) {
            throw error;
          }

          // Network errors and retryable ProviderErrors
          if (!(error instanceof ProviderError) || error.retryable) {
            if (attempt < maxRetries) {
              console.error(`[httpLlmProvider] 第 ${attempt + 1} 次尝试失败，${attempt < maxRetries - 1 ? '将重试' : '最后一次重试'}: ${error instanceof Error ? error.message : String(error)}`);
              await delay(retryDelayMs * Math.pow(2, attempt));
              continue;
            }
          }

          if (error instanceof ProviderError) {
            throw error;
          }
          console.error(`[httpLlmProvider] 原始异常 (${providerName}):`, error instanceof Error ? error.message : String(error));
          if (error instanceof Error && error.stack) {
            console.error(error.stack);
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
