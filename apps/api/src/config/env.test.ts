import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("缺少必要环境变量时会抛出包含字段名的错误", () => {
    // 这里刻意只给最小空对象，用来证明启动配置不会在缺少数据库、JWT 等关键变量时静默通过。
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({})).toThrow(/JWT_SECRET/);
  });

  it("提供开发占位配置时能解析成规范化配置", () => {
    // 这些值全部是本地开发占位数据，不包含真实数据库、真实 token 或真实内网地址。
    const env = parseEnv({
      DATABASE_URL: "postgresql://medical_record_agent:change_me@localhost:5432/medical_record_agent?schema=public",
      JWT_SECRET: "replace-with-a-long-random-development-secret",
      JWT_EXPIRES_IN: "1h",
      JWT_REFRESH_EXPIRES_IN: "7d",
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: "./storage",
      OCR_PROVIDER: "mock",
      OCR_ENDPOINT: "http://localhost:8088/ocr",
      OCR_API_KEY: "replace-with-ocr-api-key",
      LLM_PROVIDER: "mock",
      LLM_MODEL: "mock-medical-record-extractor",
      LLM_BASE_URL: "http://localhost:11434/v1",
      LLM_API_KEY: "replace-with-llm-api-key",
      LIMS_BASE_URL: "http://localhost:8090",
      LIMS_CLINICAL_INFO_ENDPOINT: "/api/clinical-info/writeback",
      LIMS_API_TOKEN: "replace-with-lims-api-token",
      LIMS_TIMEOUT_MS: "10000"
    });

    expect(env.databaseUrl).toContain("postgresql://");
    expect(env.server.port).toBe(3000);
    expect(env.storage.driver).toBe("local");
    expect(env.lims.timeoutMs).toBe(10000);
    expect(env.providers.ocr.provider).toBe("mock");
    expect(env.providers.llm.model).toBe("mock-medical-record-extractor");
  });

  it("LangChain 模型链路缺少密钥时会失败", () => {
    // LangChain 走真实模型链路时必须显式配置密钥，避免启动后才在 provider 调用阶段失败。
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://medical_record_agent:change_me@localhost:5432/medical_record_agent?schema=public",
        JWT_SECRET: "replace-with-a-long-random-development-secret",
        LLM_PROVIDER: "langchain",
        LLM_MODEL: "gpt-4.1-mini",
        LIMS_BASE_URL: "http://localhost:8090",
        LIMS_CLINICAL_INFO_ENDPOINT: "/api/clinical-info/writeback",
        LIMS_API_TOKEN: "replace-with-lims-api-token"
      })
    ).toThrow(/LLM_PROVIDER=langchain/);
  });

  it("LangChain 模型链路提供 OPENAI_API_KEY 时能解析", () => {
    // 这里的 key 是明确的本地测试占位值，不是真实 OpenAI 凭据。
    const env = parseEnv({
      DATABASE_URL: "postgresql://medical_record_agent:change_me@localhost:5432/medical_record_agent?schema=public",
      JWT_SECRET: "replace-with-a-long-random-development-secret",
      LLM_PROVIDER: "langchain",
      LLM_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "replace-with-openai-api-key",
      LIMS_BASE_URL: "http://localhost:8090",
      LIMS_CLINICAL_INFO_ENDPOINT: "/api/clinical-info/writeback",
      LIMS_API_TOKEN: "replace-with-lims-api-token"
    });

    expect(env.providers.llm.provider).toBe("langchain");
    expect(env.providers.llm.openAiApiKey).toBe("replace-with-openai-api-key");
  });
});
