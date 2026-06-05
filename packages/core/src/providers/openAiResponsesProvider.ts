import { parseModelExtractionOutput } from "../engine/extractionEngine";
import {
  ProviderError,
  type ModelProvider,
  type OpenAiResponsesProviderConfig
} from "./providerTypes";

function createMalformedResponsesOutputError(providerName: string): ProviderError {
  return new ProviderError(`模型结构化输出无效：${providerName} 返回内容不符合字段抽取 schema`, {
    providerName,
    retryable: false,
    code: "MODEL_OUTPUT_MALFORMED"
  });
}

export function createOpenAiResponsesProvider(config: OpenAiResponsesProviderConfig): ModelProvider {
  const providerName = config.providerName ?? "openai-responses";
  if (config.experimental?.enabled !== true) {
    throw new ProviderError(`OpenAI Responses provider 需要显式启用实验配置：${providerName}`, {
      providerName,
      retryable: false,
      code: "OPENAI_RESPONSES_EXPERIMENT_DISABLED"
    });
  }

  return {
    providerName,
    async extractFields(request) {
      try {
        // Responses provider 是 OpenAI Responses API 的实验适配层。
        // client 从外部注入，单元测试只使用 mock client，避免触达真实 OpenAI 服务。
        const response = await config.client.responses.create({
          model: config.model,
          input: request.prompt,
          text: {
            format: {
              type: "json_object"
            }
          }
        });

        const outputText =
          response !== null && typeof response === "object"
            ? (response as { output_text?: unknown }).output_text
            : undefined;
        const candidates = parseModelExtractionOutput(outputText, request.schema);
        if (!candidates) {
          throw createMalformedResponsesOutputError(providerName);
        }

        return {
          providerName,
          candidates,
          raw: {
            providerMode: "openai-responses"
          }
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }

        throw new ProviderError(`OpenAI Responses 调用失败：${providerName} 返回脱敏错误`, {
          providerName,
          retryable: true,
          code: "OPENAI_RESPONSES_RETRYABLE_FAILURE"
        });
      }
    }
  };
}
