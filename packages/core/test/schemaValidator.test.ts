import { describe, expect, it } from "vitest";

import {
  limsClinicalInfoSchema,
  validateCoreSchemaDraft,
  validateCoreSchemaDraftInput
} from "../src/index";

describe("schema validator", () => {
  it("accepts the built-in lims-clinical-info schema", () => {
    const result = validateCoreSchemaDraft(limsClinicalInfoSchema);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(limsClinicalInfoSchema.key).toBe("lims-clinical-info");
    expect(limsClinicalInfoSchema.evidencePolicy.required).toBe(true);
    expect(limsClinicalInfoSchema.fields.some((field) => field.comments.length > 0)).toBe(true);
    expect(limsClinicalInfoSchema.fields.some((field) => field.adapterHints?.limsTargetPath)).toBe(true);
    expect(limsClinicalInfoSchema.fields.some((field) => field.enumMap)).toBe(true);
    expect(limsClinicalInfoSchema.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "clinicalDiagnosis",
        "sampleType",
        "tumorType",
        "tumorStage",
        "reportDate"
      ])
    );
  });

  it("returns actionable errors for invalid schema drafts", () => {
    const result = validateCoreSchemaDraft({
      key: "bad-clinical-schema",
      label: "错误的临床信息 Schema",
      version: "0.0.1",
      evidencePolicy: {
        required: true,
        minConfidence: 0.8,
        requireSourceText: true,
        requirePageReference: true
      },
      fields: [
        {
          key: "smoking",
          label: "吸烟史",
          type: "string",
          comments: ["合法字段用于制造重复 key 场景。"],
          adapterHints: {
            limsTargetPath: "clinicalInfo.smokingHistory"
          }
        },
        {
          key: "smoking",
          label: "",
          type: "unsupported",
          comments: [],
          adapterHints: {
            limsTargetPath: "clinicalInfo..bad"
          }
        }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_FIELD_KEY",
          path: "fields[1].key",
          message: expect.stringContaining("smoking")
        }),
        expect.objectContaining({
          code: "MISSING_FIELD_LABEL",
          path: "fields[1].label",
          message: expect.stringContaining("补充")
        }),
        expect.objectContaining({
          code: "UNSUPPORTED_FIELD_TYPE",
          path: "fields[1].type",
          message: expect.stringContaining("string")
        }),
        expect.objectContaining({
          code: "INVALID_TARGET_PATH",
          path: "fields[1].adapterHints.limsTargetPath",
          message: expect.stringContaining("clinicalInfo")
        })
      ])
    );
  });

  it("safely validates unknown online schema input without throwing", () => {
    const result = validateCoreSchemaDraftInput({
      key: "",
      fields: "not-array",
      evidencePolicy: {
        minConfidence: 1.2
      }
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_SCHEMA_KEY",
          path: "key",
          message: expect.stringContaining("填写")
        }),
        expect.objectContaining({
          code: "MISSING_SCHEMA_LABEL",
          path: "label",
          message: expect.stringContaining("填写")
        }),
        expect.objectContaining({
          code: "MISSING_SCHEMA_VERSION",
          path: "version",
          message: expect.stringContaining("填写")
        }),
        expect.objectContaining({
          code: "INVALID_FIELDS",
          path: "fields",
          message: expect.stringContaining("数组")
        }),
        expect.objectContaining({
          code: "INVALID_MIN_CONFIDENCE",
          path: "evidencePolicy.minConfidence",
          message: expect.stringContaining("0 到 1")
        })
      ])
    );
  });

  it("safely reports missing evidence policy and enum maps", () => {
    const result = validateCoreSchemaDraftInput({
      key: "draft-schema",
      label: "草稿 Schema",
      version: "0.0.1",
      fields: [
        {
          key: "sampleType",
          label: "样本类型",
          type: "enum",
          comments: ["枚举字段必须配置枚举映射。"],
          adapterHints: {
            limsTargetPath: "clinicalInfo.sampleType"
          }
        }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_EVIDENCE_POLICY",
          path: "evidencePolicy",
          message: expect.stringContaining("补充")
        }),
        expect.objectContaining({
          code: "MISSING_ENUM_MAP",
          path: "fields[0].enumMap",
          message: expect.stringContaining("sampleType")
        })
      ])
    );
  });
});
