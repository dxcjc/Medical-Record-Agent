import { describe, expect, it } from "vitest";

import {
  buildEvaluationRunRequest,
  buildEvaluationSampleImportPayload,
  parseEvaluationProviderOptions,
  parseEvaluationSchemaOptions
} from "./EvaluationPage";

describe("EvaluationPage 配置解析", () => {
  it("把真实 Schema API 响应转换成评测 run 可用的 schemaKey 选项", () => {
    const options = parseEvaluationSchemaOptions({
      items: [
        {
          schemaKey: "custom-clinical-schema",
          displayName: "通用病历字段",
          version: 3
        }
      ]
    });

    expect(options).toEqual([
      {
        value: "custom-clinical-schema",
        label: "通用病历字段 v3"
      }
    ]);
  });

  it("只把 LLM provider 放进评测模型下拉，避免误选 OCR 或存储 provider", () => {
    const response = {
      items: [
        { key: "mock-ocr", kind: "ocr", name: "Mock OCR" },
        { key: "mock-model", kind: "llm", name: "Mock Model" },
        { key: "record-storage", kind: "storage", name: "Record Storage" }
      ]
    };

    expect(parseEvaluationProviderOptions(response)).toEqual([
      {
        value: "mock-model",
        label: "Mock Model"
      }
    ]);
  });

  it("创建评测 run 请求时携带 schemaKey、providerKey 和从样本范围解析出的 sampleLimit", () => {
    expect(
      buildEvaluationRunRequest("dataset-001", {
        name: "候选评测",
        schemaVersion: "custom-clinical-schema",
        modelVersion: "mock-model",
        sampleScope: "抽样 20 条"
      })
    ).toEqual({
      datasetId: "dataset-001",
      schemaKey: "custom-clinical-schema",
      providerKey: "mock-model",
      sampleLimit: 20
    });
  });

  it("导入评估样本时生成字段级 groundTruth，不再提交空对象", () => {
    expect(
      buildEvaluationSampleImportPayload({
        sourceType: "CSV",
        fileName: "admission_eval_samples_0605.csv",
        sampleImportStatus: "校验中",
        groundTruthStatusText: "字段匹配中",
        groundTruthFieldKey: "clinicalDiagnosis",
        groundTruthValue: "肺腺癌",
        predictedValue: "肺腺癌?",
        expectedNeedsReview: true
      })
    ).toEqual([
      {
        externalId: "admission_eval_samples_0605.csv",
        input: {
          sourceType: "CSV",
          fileName: "admission_eval_samples_0605.csv",
          predictedValue: "肺腺癌?"
        },
        groundTruth: {
          clinicalDiagnosis: {
            value: "肺腺癌",
            normalizedValue: "肺腺癌",
            expectedNeedsReview: true
          }
        },
        metadata: {
          sourceType: "CSV",
          fileName: "admission_eval_samples_0605.csv",
          groundTruthFieldKey: "clinicalDiagnosis"
        }
      }
    ]);
  });
});
