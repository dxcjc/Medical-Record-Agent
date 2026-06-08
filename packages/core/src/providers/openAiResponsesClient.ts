import OpenAI from "openai";

import type { OpenAiResponsesClientLike } from "./providerTypes";

export interface CreateOpenAiResponsesClientInput {
  apiKey: string;
}

/**
 * 创建真实 OpenAI Responses SDK client。
 * 这里不发起网络请求，只把官方 SDK 的 responses.create 形状注入 provider；
 * 实际调用发生在识别运行时，便于单元测试用 fake client 完整隔离公网。
 */
export function createOpenAiResponsesClient(input: CreateOpenAiResponsesClientInput): OpenAiResponsesClientLike {
  const client = new OpenAI({
    apiKey: input.apiKey
  });

  return {
    responses: {
      create(request) {
        return client.responses.create({
          input: request.input,
          model: request.model,
          text: request.text
        } as Parameters<typeof client.responses.create>[0]);
      }
    }
  };
}
