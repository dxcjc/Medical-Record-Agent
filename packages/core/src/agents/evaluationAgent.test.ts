import { describe, it, expect } from "vitest";
import { generateCandidates } from "./evaluationAgent";
import type { EvaluationSampleResult } from "../evaluation/evaluationRunner";

describe("generateCandidates", () => {
  it("无错误样本时返回空数组", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "name", groundTruthValue: "张三", predictedValue: "张三", normalizedGroundTruthValue: "张三", normalizedPredictedValue: "张三" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toEqual([]);
  });

  it("单条错误生成纠偏候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.ruleType).toBe("correction");
    expect(candidates[0]!.proposal).toEqual({
      type: "correction",
      fieldKey: "sample_type",
      originalValue: "血清",
      correctedValue: "外周血"
    });
    expect(candidates[0]!.evidence).toHaveLength(1);
    expect(candidates[0]!.evidence[0]!.sampleId).toBe("s1");
  });

  it("同字段 ≥2 条错误时额外生成规则候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
        ],
        warnings: []
      },
      {
        sampleId: "s2",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血浆", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血浆" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    // 2 条纠偏候选 + 1 条规则候选
    expect(candidates).toHaveLength(3);
    const ruleCandidate = candidates.find(c => c.ruleType === "rule");
    expect(ruleCandidate).toBeDefined();
    expect(ruleCandidate!.proposal.type).toBe("rule");
    expect((ruleCandidate!.proposal as any).expectedValue).toBe("外周血");
    expect((ruleCandidate!.proposal as any).evidenceCount).toBe(2);
  });

  it("多个字段各有错误时分别生成候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" },
          { fieldKey: "gene", groundTruthValue: "EGFR", predictedValue: "KRAS", normalizedGroundTruthValue: "EGFR", normalizedPredictedValue: "KRAS" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toHaveLength(2);
    expect(candidates.map(c => c.fieldKey).sort()).toEqual(["gene", "sample_type"]);
  });

  it("同字段 ≥2 条错误但 correctedValue 不一致时不生成规则候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
        ],
        warnings: []
      },
      {
        sampleId: "s2",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "全血", predictedValue: "血浆", normalizedGroundTruthValue: "全血", normalizedPredictedValue: "血浆" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    // 2 条纠偏候选，但不生成规则候选（因为 correctedValue 不一致）
    expect(candidates).toHaveLength(2);
    expect(candidates.every(c => c.ruleType === "correction")).toBe(true);
  });
});
