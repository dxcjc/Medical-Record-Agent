import { ChatOpenAI } from "@langchain/openai";

import type { LangChainModelLike } from "./providerTypes";

export interface OpenAiLangChainModelConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
}

export function createOpenAiLangChainModel(config: OpenAiLangChainModelConfig): LangChainModelLike {
  // LangChain 的 ChatOpenAI 是主流 agent 技术栈里最常见的模型入口之一。
  // 这里把厂商 SDK 装配隔离在 provider 边界，业务编排层只感知 LangChainModelLike，
  // 后续要切换 Azure OpenAI、兼容网关或本地模型时，可以继续复用同一个抽取 provider。
  const modelConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature ?? 0
  };

  if (config.baseUrl) {
    modelConfig.configuration = {
      baseURL: config.baseUrl
    };
  }

  return new ChatOpenAI(modelConfig) as LangChainModelLike;
}
