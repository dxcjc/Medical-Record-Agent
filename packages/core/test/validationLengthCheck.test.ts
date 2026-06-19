import { describe, expect, it } from "vitest";

import { runValidationEngine } from "../src/engine/validationEngine";
import { limsClinicalInfoSchema } from "../src/index";

import type { CoreSchemaDraft } from "../src/schemas/schemaValidator";
import type { ModelFieldCandidate } from "../src/providers/providerTypes";

// P1-3：pathologicalDiagnosis 长度校验 + 后处理 + 重抽触发。
// Agent 输出完整病理描述时，validationEngine 应：
// 1. 超长且 normalizer 能简化 → 后处理更新值，不触发重抽
// 2. 超长且 normalizer 无法简化 → 加入 reextractionFieldKeys 触发重抽
// 3. 未超长 → 不处理

function schemaWithPathologicalDiagnosis(): CoreSchemaDraft {
  return {
    ...limsClinicalInfoSchema,
    fields: [
      ...limsClinicalInfoSchema.fields,
      {
        key: "pathologicalDiagnosis",
        label: "病理诊断",
        type: "string" as const,
        comments: ["病理诊断简短名称"],
        required: true
      }
    ]
  };
}

function candidate(value: string, overrides: Partial<ModelFieldCandidate> = {}): ModelFieldCandidate {
  return {
    fieldKey: "pathologicalDiagnosis",
    value,
    rawValue: value,
    confidence: 0.9,
    evidence: [{ snippet: value, startOffset: 0, endOffset: value.length, pageNumber: 1 }],
    ...overrides
  };
}

describe("validationEngine 长度校验与后处理（P1-3）", () => {
  it("超长且 normalizer 能简化时，后处理更新值且不触发重抽", () => {
    const schema = schemaWithPathologicalDiagnosis();
    // 构造 >40 字符且 normalizer 能简化的值：部位前缀 + 长诊断 + 转移后缀
    // normalizer 去前缀和后缀后应得到简短核心诊断
    const longValue = "（肝脏右前叶段S7段）转移性低分化腺癌伴部分印戒细胞癌形态学改变，符合肠癌肝转移灶伴广泛坏死";
    // 确保超过 40 字符
    expect(longValue.length).toBeGreaterThan(40);

    const result = runValidationEngine({
      schema,
      candidates: [candidate(longValue)]
    });

    expect(result.reextractionFieldKeys).not.toContain("pathologicalDiagnosis");
    // normalizedCandidates 中该字段值应被简化（去前缀+取主诊断）
    const processed = result.normalizedCandidates.find((c) => c.fieldKey === "pathologicalDiagnosis");
    expect((processed?.value as string).length).toBeLessThanOrEqual(40);
    expect(processed?.value).toContain("转移性低分化腺癌");
    // 应有 VALUE_TOO_LONG 的 warning issue
    const fieldResult = result.fieldResults.find((f) => f.fieldKey === "pathologicalDiagnosis");
    expect(fieldResult?.issues.some((i) => i.code === "VALUE_TOO_LONG")).toBe(true);
  });

  it("超长且 normalizer 无法简化时，加入 reextractionFieldKeys 触发重抽", () => {
    const schema = schemaWithPathologicalDiagnosis();
    // 构造一个 normalizer 无法简化的超长值：无括号前缀、无逗号分隔，纯长字符串（>40 字符）
    const longUnsimplifiable = "低分化腺癌伴部分印戒细胞癌形态伴有神经内分泌分化特征并可见脉管瘤栓浸润周围脂肪组织";
    // 确保超过 40 字符
    expect(longUnsimplifiable.length).toBeGreaterThan(40);

    const result = runValidationEngine({
      schema,
      candidates: [candidate(longUnsimplifiable)]
    });

    expect(result.reextractionFieldKeys).toContain("pathologicalDiagnosis");
    // 值未被修改
    const processed = result.normalizedCandidates.find((c) => c.fieldKey === "pathologicalDiagnosis");
    expect(processed?.value).toBe(longUnsimplifiable);
    const fieldResult = result.fieldResults.find((f) => f.fieldKey === "pathologicalDiagnosis");
    expect(fieldResult?.issues.some((i) => i.code === "VALUE_TOO_LONG" && i.message.includes("需重新抽取"))).toBe(true);
  });

  it("未超长时不做任何处理", () => {
    const schema = schemaWithPathologicalDiagnosis();
    const shortValue = "膀胱高级别尿路上皮癌"; // 10 字符，未超阈值
    const result = runValidationEngine({
      schema,
      candidates: [candidate(shortValue)]
    });

    expect(result.reextractionFieldKeys).not.toContain("pathologicalDiagnosis");
    const processed = result.normalizedCandidates.find((c) => c.fieldKey === "pathologicalDiagnosis");
    expect(processed?.value).toBe(shortValue);
    const fieldResult = result.fieldResults.find((f) => f.fieldKey === "pathologicalDiagnosis");
    expect(fieldResult?.issues.some((i) => i.code === "VALUE_TOO_LONG")).toBe(false);
  });

  it("非字符串值不做长度校验", () => {
    const schema = schemaWithPathologicalDiagnosis();
    const result = runValidationEngine({
      schema,
      candidates: [candidate("", { value: 123, fieldKey: "tumorStage" })]
    });

    expect(result.reextractionFieldKeys).toEqual([]);
  });
});
