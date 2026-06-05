import { createHttpOcrProvider } from "./httpOcrProvider";
import { createHttpLlmProvider } from "./httpLlmProvider";
import { createLangChainModelProvider } from "./langchainModelProvider";
import { createMockModelProvider } from "./mockModelProvider";
import { createMockOcrProvider } from "./mockOcrProvider";
import { createOpenAiResponsesProvider } from "./openAiResponsesProvider";
import {
  ProviderError,
  type ModelProvider,
  type ModelProviderFactoryConfig,
  type OcrProvider,
  type OcrProviderFactoryConfig
} from "./providerTypes";

export function createOcrProvider(config: OcrProviderFactoryConfig): OcrProvider {
  // Factory 只负责根据配置选择 provider，不把真实 OCR 服务细节写死在业务代码里。
  // 这样生产环境可以通过 endpoint、headers、timeout、retry、mapping 配置切换不同 OCR 网关。
  if (config.kind === "mock") {
    return createMockOcrProvider(config.mock);
  }

  if (config.kind === "http") {
    return createHttpOcrProvider(config.http);
  }

  throw new ProviderError("未知 OCR provider 配置", {
    providerName: "provider-factory",
    retryable: false,
    code: "UNKNOWN_OCR_PROVIDER"
  });
}

export function createModelProvider(config: ModelProviderFactoryConfig): ModelProvider {
  // Model provider factory 只根据配置选择适配层。
  // 真实模型 endpoint、SDK client 或 LangChain model 都由外部配置注入，避免业务代码写死厂商。
  if (config.kind === "mock") {
    return createMockModelProvider(config.mock);
  }

  if (config.kind === "langchain") {
    return createLangChainModelProvider(config.langchain);
  }

  if (config.kind === "http") {
    return createHttpLlmProvider(config.http);
  }

  if (config.kind === "openai-responses") {
    return createOpenAiResponsesProvider(config.openAiResponses);
  }

  throw new ProviderError("未知模型 provider 配置", {
    providerName: "provider-factory",
    retryable: false,
    code: "UNKNOWN_MODEL_PROVIDER"
  });
}
