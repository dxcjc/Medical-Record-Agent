import { PromptTemplate } from "@langchain/core/prompts";

import { extractionOutputSchema, parseModelExtractionOutput } from "../engine/extractionEngine";
import { ProviderError, type LangChainModelProviderConfig, type ModelProvider } from "./providerTypes";

function createMalformedOutputError(providerName: string): ProviderError {
  return new ProviderError(`模型结构化输出无效：${providerName} 返回内容不符合字段抽取 schema`, {
    providerName,
    retryable: false,
    code: "MODEL_OUTPUT_MALFORMED"
  });
}

export function createLangChainModelProvider(config: LangChainModelProviderConfig): ModelProvider {
  const providerName = config.providerName ?? "langchain-model";

  return {
    providerName,
    async extractFields(request) {
      try {
        // LangChain provider 作为默认生产学习路径，只绑定 prompt template 与 structured output 边界。
        // 真实 ChatModel 由外部注入，测试也能注入 model-like 对象，避免单元测试调用真实大模型。
        const promptTemplate = PromptTemplate.fromTemplate("{prompt}");
        const prompt = await promptTemplate.format({ prompt: request.prompt });
        const structuredModel = config.model.withStructuredOutput
          ? config.model.withStructuredOutput(extractionOutputSchema as unknown as Record<string, unknown>)
          : config.model;

        if (!structuredModel.invoke) {
          throw createMalformedOutputError(providerName);
        }

        const output = await structuredModel.invoke(prompt);
        const candidates = parseModelExtractionOutput(output, request.schema);
        if (!candidates) {
          throw createMalformedOutputError(providerName);
        }

        return {
          providerName,
          candidates,
          raw: {
            // raw 只保留 provider 类型摘要，不能透传模型完整输出，因为模型输出可能复述病历原文。
            providerMode: "langchain-structured-output"
          }
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }

        throw new ProviderError(`LangChain 模型调用失败：${providerName} 返回脱敏错误`, {
          providerName,
          retryable: true,
          code: "LANGCHAIN_MODEL_RETRYABLE_FAILURE"
        });
      }
    }
  };
}
