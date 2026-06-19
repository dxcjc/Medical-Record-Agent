import { HumanMessage } from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";

import { extractionOutputSchema, parseModelExtractionOutput } from "../engine/extractionEngine";
import { ProviderError, type StructuredModelProviderConfig, type ModelProvider } from "./providerTypes";

function createMalformedOutputError(providerName: string): ProviderError {
  return new ProviderError(`模型结构化输出无效：${providerName} 返回内容不符合字段抽取 schema`, {
    providerName,
    retryable: false,
    code: "MODEL_OUTPUT_MALFORMED"
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

export function createLangChainModelProvider(config: StructuredModelProviderConfig): ModelProvider {
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

        // 视觉增强：当请求携带图片时，构造多模态 HumanMessage（文本 + image_url blocks）。
        // LangChain ChatModel 的 invoke 支持 HumanMessage with multimodal content，
        // 兼容 OpenAI 协议的 image_url 结构。此前 langchain provider 会丢弃图片，导致
        // 视觉审查节点在 langchain 模式下无法收图。
        const images = collectImages(request);
        const message = images
          ? new HumanMessage({
              content: [
                { type: "text", text: prompt },
                ...images.map((img) => ({
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${img}` }
                }))
              ]
            })
          : prompt;

        const output = await structuredModel.invoke(message);
        const candidates = parseModelExtractionOutput(output, request.schema);
        if (!candidates) {
          throw createMalformedOutputError(providerName);
        }

        return {
          providerName,
          candidates,
          raw: {
            // raw 只保留 provider 类型摘要，不能透传模型完整输出，因为模型输出可能复述病历原文。
            providerMode: "langchain-structured-output",
            multimodal: images !== null,
            imageCount: images ? images.length : 0
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
