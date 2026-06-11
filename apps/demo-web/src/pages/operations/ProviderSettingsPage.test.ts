import { describe, expect, it } from "vitest";

import {
  buildProviderConfigSaveRequest,
  buildProviderKeyForArea,
  describeProviderAsyncAction,
  matchesProviderArea,
  providerKinds,
  sanitizeStoredProviderConfigs
} from "./ProviderSettingsPage";

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
        providerKind: "openai-responses",
        displayProviderKind: "OpenAI Responses",
        endpoint: "https://api.openai.com/v1/responses",
        modelOrBucket: "gpt-4.1-mini",
        timeoutMs: 45000
      },
      secretRefs: {
        apiKey: "OPENAI_API_KEY"
      }
    });
  });

  it("只恢复结构合法的本地 Provider 草稿，避免坏数据污染配置页", () => {
    expect(
      sanitizeStoredProviderConfigs([
        { area: "OCR", kind: "HTTP OCR", endpoint: "https://ocr.example/v1", modelOrBucket: "ocr", secret: "OCR_SECRET", timeoutMs: 1000, enabled: true },
        { area: "LLM", kind: "OpenAI Responses", endpoint: "http://llm", modelOrBucket: "gpt", secret: "LLM_SECRET", timeoutMs: 2000, enabled: true },
        { area: "storage", kind: "Object Storage", endpoint: "s3://bucket", modelOrBucket: "records", secret: "STORAGE_SECRET", timeoutMs: 3000, enabled: true },
        { area: "storage", kind: "LIMS REST", endpoint: "https://lims.example/api", modelOrBucket: "lims", secret: "LIMS_SECRET", timeoutMs: 4000, enabled: false }
      ])
    )?.toHaveLength(4);

    expect(sanitizeStoredProviderConfigs([{ area: "unknown", kind: "Mock" }])).toBeNull();
  });

  it("普通用户可选 Provider 类型不包含 Mock，并保留真实生产类型", () => {
    expect(providerKinds).not.toContain("Mock");
    expect(providerKinds).toEqual(expect.arrayContaining(["HTTP OCR", "LangChain", "OpenAI-compatible", "OpenAI Responses", "LIMS REST"]));
  });

  it("健康检查主路径不会把 mock 或 development placeholder provider 当作真实 OCR/LLM 匹配项", () => {
    expect(
      matchesProviderArea(
        {
          key: "mock-ocr",
          kind: "ocr",
          name: "Mock OCR Provider",
          enabled: false,
          isMock: true,
          status: "development_placeholder"
        },
        "OCR"
      )
    ).toBe(false);
    expect(
      matchesProviderArea(
        {
          key: "http-ocr",
          kind: "ocr",
          name: "HTTP OCR Provider",
          enabled: true,
          isMock: false
        },
        "OCR"
      )
    ).toBe(true);
  });

  it("Provider 保存和健康检查状态提供取消、重试和错误恢复提示", () => {
    expect(describeProviderAsyncAction({ kind: "saving", pendingCount: 4 })).toEqual({
      tone: "info",
      title: "Provider 配置保存中",
      message: "正在同步 4 个 Provider 配置，可取消当前请求后重试。",
      canCancel: true,
      canRetry: false
    });

    expect(describeProviderAsyncAction({ kind: "checking", area: "OCR", providerKey: "http-ocr" })).toEqual({
      tone: "info",
      title: "Provider Health Check 进行中",
      message: "OCR 正在调用真实 Provider Health API：http-ocr。",
      canCancel: true,
      canRetry: false
    });

    expect(describeProviderAsyncAction({ kind: "failed", area: "storage", errorMessage: "PROVIDER_NOT_FOUND" })).toEqual({
      tone: "warning",
      title: "Provider 操作失败",
      message: "LIMS 操作失败：PROVIDER_NOT_FOUND。请刷新 Provider API 或重试上一次操作。",
      canCancel: false,
      canRetry: true
    });
  });
});
