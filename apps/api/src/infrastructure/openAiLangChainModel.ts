import { ChatOpenAI } from "@langchain/openai";

import type { StructuredLanguageModel } from "@medical-record-agent/core";

export interface OpenAiLangChainModelConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
}

export function createOpenAiLangChainModel(config: OpenAiLangChainModelConfig): StructuredLanguageModel {
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

  return new ChatOpenAI(modelConfig) as unknown as StructuredLanguageModel;
}
