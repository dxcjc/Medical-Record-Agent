import { describe, expect, it } from "vitest";

import { createSyntheticRecognitionFile, parseProviderOptions, parseSchemaOptions } from "./NewRecognitionPage";

describe("NewRecognitionPage option parsing", () => {
  it("把真实 Schema API 响应转换成 value=backend key 的下拉选项", () => {
    const options = parseSchemaOptions({
      items: [
        {
          schemaKey: "lims-clinical-info",
          displayName: "LIMS 临床信息弹窗字段",
          version: 2
        }
      ]
    });

    expect(options).toEqual([
      {
        value: "lims-clinical-info",
        label: "LIMS 临床信息弹窗字段 v2"
      }
    ]);
  });

  it("按 kind 过滤 Provider API 响应，避免把 storage 或 LIMS provider 传给识别任务", () => {
    const response = {
      items: [
        { key: "mock-ocr", kind: "ocr", name: "Mock OCR Provider" },
        { key: "mock-model", kind: "llm", name: "Mock Model Provider" },
        { key: "local-storage", kind: "storage", name: "Local Storage Provider" }
      ]
    };

    expect(parseProviderOptions(response, "ocr")).toEqual([
      {
        value: "mock-ocr",
        label: "Mock OCR Provider"
      }
    ]);
    expect(parseProviderOptions(response, "llm")).toEqual([
      {
        value: "mock-model",
        label: "Mock Model Provider"
      }
    ]);
  });

  it("合成样本也创建真实 Blob/File 内容，避免只创建无字节文件记录", async () => {
    const file = createSyntheticRecognitionFile();

    expect(file.name).toBe("synthetic-clinical-record.pdf");
    expect(file.type).toBe("application/pdf");
    await expect(file.text()).resolves.toContain("synthetic clinical record");
  });
});
