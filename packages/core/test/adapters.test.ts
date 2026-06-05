import { describe, expect, it } from "vitest";

import {
  AdapterError,
  buildGenericJsonPayload,
  buildLimsClinicalPayload,
  limsClinicalInfoSchema,
  type CoreSchemaDraft,
  type ModelFieldCandidate
} from "../src/index";

function candidate(overrides: Partial<ModelFieldCandidate> = {}): ModelFieldCandidate {
  return {
    fieldKey: "clinicalDiagnosis",
    value: "DEMO_DIAGNOSIS_A",
    rawValue: "诊断：DEMO_DIAGNOSIS_A",
    confidence: 0.94,
    evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 10, endOffset: 31, pageNumber: 1 }],
    ...overrides
  };
}

describe("payload adapters", () => {
  it("builds nested generic JSON payload from target paths", () => {
    const payload = buildGenericJsonPayload([
      {
        fieldKey: "clinicalDiagnosis",
        targetPath: "clinicalInfo.clinicalDiagnosis",
        value: "DEMO_DIAGNOSIS_A"
      },
      {
        fieldKey: "sampleType",
        targetPath: "clinicalInfo.sampleType",
        value: "tissue"
      },
      {
        fieldKey: "reportDate",
        targetPath: "meta.reportDate",
        value: "2026-06-04"
      }
    ]);

    expect(payload).toEqual({
      clinicalInfo: {
        clinicalDiagnosis: "DEMO_DIAGNOSIS_A",
        sampleType: "tissue"
      },
      meta: {
        reportDate: "2026-06-04"
      }
    });
  });

  it("supports top-level generic JSON target paths", () => {
    const payload = buildGenericJsonPayload([
      // 顶层字段不应该被强制要求写成 a.b 这种嵌套路径形式。
      {
        fieldKey: "patientName",
        targetPath: "patientName",
        value: "张三"
      },
      {
        fieldKey: "sampleType",
        targetPath: "sampleType",
        value: "tissue"
      }
    ]);

    expect(payload).toEqual({
      patientName: "张三",
      sampleType: "tissue"
    });
  });

  it("maps LIMS clinical payload using schema adapter hints", () => {
    const result = buildLimsClinicalPayload({
      schema: limsClinicalInfoSchema,
      candidates: [
        candidate(),
        candidate({
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "样本类型：组织",
          confidence: 0.93,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        })
      ]
    });

    expect(result.mappedFields).toEqual([
      expect.objectContaining({
        fieldKey: "clinicalDiagnosis",
        targetPath: "clinicalInfo.clinicalDiagnosis",
        value: "DEMO_DIAGNOSIS_A"
      }),
      expect.objectContaining({
        fieldKey: "sampleType",
        targetPath: "clinicalInfo.sampleType",
        value: "tissue"
      })
    ]);
    expect(result.payload).toEqual({
      clinicalInfo: {
        clinicalDiagnosis: "DEMO_DIAGNOSIS_A",
        sampleType: "tissue"
      }
    });
  });

  it("rejects fields with missing target paths", () => {
    const schema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: limsClinicalInfoSchema.fields.map((field) =>
        field.key === "tumorType"
          ? { ...field, adapterHints: { ...field.adapterHints, limsTargetPath: undefined } }
          : field
      )
    };

    expect(() =>
      buildLimsClinicalPayload({
        schema,
        candidates: [
          candidate({
            fieldKey: "tumorType",
            value: "肺腺癌",
            rawValue: "病理提示肺腺癌",
            confidence: 0.91,
            evidence: [{ snippet: "病理提示肺腺癌", startOffset: 20, endOffset: 27, pageNumber: 1 }]
          })
        ]
      })
    ).toThrowError(AdapterError);
  });
});
