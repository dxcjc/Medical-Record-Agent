import { describe, expect, it } from "vitest";

import { createConflictResolutionNode } from "../src/nodes/conflictResolutionNode";
import { limsClinicalInfoSchema } from "../src/schemas/limsClinicalInfoSchema";

import type { CoreSchemaDraft } from "../src/schemas/schemaValidator";
import type { ModelFieldCandidate } from "../src/providers/providerTypes";

// 任务5：冲突解决重构。
// 原问题:必填字段+双方 conf>0.6 即 high 冲突,几乎必中,导致每个样本都重试。
// 重构后:值相近(子串包含)不算冲突;提高 high 阈值到 0.7;真矛盾才重试。

function schemaWithRequiredField(): CoreSchemaDraft {
  return {
    ...limsClinicalInfoSchema,
    fields: limsClinicalInfoSchema.fields.map((f) =>
      f.key === "tumorType" ? { ...f, required: true } : f
    )
  };
}

function candidate(fieldKey: string, value: string, confidence: number): ModelFieldCandidate {
  return {
    fieldKey,
    value,
    rawValue: value,
    confidence,
    evidence: [{ snippet: value, startOffset: 0, endOffset: value.length, pageNumber: 1 }]
  };
}

describe("冲突解决重构（任务5）", () => {
  it("值相近(子串包含)不算冲突,不触发重试", () => {
    const schema = schemaWithRequiredField();
    const node = createConflictResolutionNode();
    // 抽取: "肺腺癌", 视觉: "肺腺癌伴坏死" —— 前者是后者子串,值相近不算冲突
    const result = node.run({
      schema,
      extractionCandidates: [candidate("tumorType", "肺腺癌", 0.85)],
      visualCandidates: [candidate("tumorType", "肺腺癌伴坏死", 0.8)],
      conflictThreshold: 0.1
    });

    // 不应有冲突,不应触发重试
    expect(result.hasConflicts).toBe(false);
    expect(result.needsReextraction).toBe(false);
  });

  it("值真矛盾(非子串包含)+ 双方高置信度 → high 冲突", () => {
    const schema = schemaWithRequiredField();
    const node = createConflictResolutionNode();
    // 抽取: "肺癌", 视觉: "胃癌" —— 完全不同的值
    const result = node.run({
      schema,
      extractionCandidates: [candidate("tumorType", "肺癌", 0.85)],
      visualCandidates: [candidate("tumorType", "胃癌", 0.8)],
      conflictThreshold: 0.1
    });

    expect(result.hasConflicts).toBe(true);
    const conflict = result.conflicts.find((c) => c.fieldKey === "tumorType");
    expect(conflict?.conflictSeverity).toBe("high");
  });

  it("真矛盾但置信度低于 0.7 → 不算 high 冲突,不触发重试", () => {
    const schema = schemaWithRequiredField();
    const node = createConflictResolutionNode();
    // 抽取: "肺癌" conf=0.65, 视觉: "胃癌" conf=0.6 —— 矛盾但置信度不够高
    const result = node.run({
      schema,
      extractionCandidates: [candidate("tumorType", "肺癌", 0.65)],
      visualCandidates: [candidate("tumorType", "胃癌", 0.6)],
      conflictThreshold: 0.1
    });

    // 有冲突但不是 high(needsReextraction 只在 high 时触发)
    const conflict = result.conflicts.find((c) => c.fieldKey === "tumorType");
    expect(conflict?.conflictSeverity).not.toBe("high");
    expect(result.needsReextraction).toBe(false);
  });

  it("真矛盾 + 双方高置信度 + 置信度接近 → 触发重试", () => {
    const schema = schemaWithRequiredField();
    const node = createConflictResolutionNode();
    // 抽取: "肺癌" conf=0.85, 视觉: "胃癌" conf=0.82 —— 真矛盾,高置信,接近
    const result = node.run({
      schema,
      extractionCandidates: [candidate("tumorType", "肺癌", 0.85)],
      visualCandidates: [candidate("tumorType", "胃癌", 0.82)],
      conflictThreshold: 0.1
    });

    expect(result.needsReextraction).toBe(true);
    expect(result.reextractionHints?.fieldKeys).toContain("tumorType");
  });

  it("视觉置信度显著高于抽取且抽取低置信 → 用视觉值覆盖(后处理修正)", () => {
    const schema = schemaWithRequiredField();
    const node = createConflictResolutionNode();
    // 抽取: "肺" conf=0.4(低), 视觉: "肺腺癌" conf=0.85(高) —— 视觉更可信
    const result = node.run({
      schema,
      extractionCandidates: [candidate("tumorType", "肺", 0.4)],
      visualCandidates: [candidate("tumorType", "肺腺癌", 0.85)],
      conflictThreshold: 0.1
    });

    // "肺" 是 "肺腺癌" 的子串,不算冲突 → 但只一方有视觉值时用视觉
    // 实际两方都有值,子串包含不算冲突,走"值相同合并"逻辑取更高置信
    const merged = result.mergedCandidates.find((c) => c.fieldKey === "tumorType");
    expect(merged?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("多个必填字段中只有真矛盾的才触发重试,子串包含的不计", () => {
    const schema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: [
        { key: "fieldA", label: "A", type: "string", comments: [], required: true },
        { key: "fieldB", label: "B", type: "string", comments: [], required: true }
      ]
    };
    const node = createConflictResolutionNode();
    const result = node.run({
      schema,
      // fieldA: 子串包含(不算冲突); fieldB: 真矛盾
      extractionCandidates: [
        candidate("fieldA", "肺腺癌", 0.85),
        candidate("fieldB", "肺癌", 0.85)
      ],
      visualCandidates: [
        candidate("fieldA", "肺腺癌伴坏死", 0.82),
        candidate("fieldB", "胃癌", 0.82)
      ],
      conflictThreshold: 0.1
    });

    // 只有 fieldB 是真矛盾,只有它进 reextractionHints
    expect(result.needsReextraction).toBe(true);
    expect(result.reextractionHints?.fieldKeys).toEqual(["fieldB"]);
  });
});
