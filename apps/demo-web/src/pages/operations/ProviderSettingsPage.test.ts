import { describe, expect, it } from "vitest";

import { buildProviderConfigSaveRequest, buildProviderKeyForArea } from "./ProviderSettingsPage";

describe("ProviderSettingsPage provider config mapping", () => {
  it("把页面表单配置转换成后端 provider 持久化契约", () => {
    const request = buildProviderConfigSaveRequest({
      area: "LLM",
      kind: "OpenAI Responses",
      endpoint: "https://api.openai.com/v1/responses",
      modelOrBucket: "gpt-4.1-mini",
      secret: "OPENAI_API_KEY",
      timeoutMs: 45000,
      enabled: true
    });

    expect(buildProviderKeyForArea("LLM")).toBe("configured-llm-provider");
    expect(request).toEqual({
      kind: "llm",
      displayName: "LLM OpenAI Responses Provider",
      enabled: true,
      isDefault: true,
      config: {
        providerKind: "OpenAI Responses",
        endpoint: "https://api.openai.com/v1/responses",
        modelOrBucket: "gpt-4.1-mini",
        timeoutMs: 45000
      },
      secretRefs: {
        primary: "OPENAI_API_KEY"
      }
    });
  });
});
