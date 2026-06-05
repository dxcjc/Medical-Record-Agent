import { describe, expect, it } from "vitest";

import { calculateFieldMetrics } from "./metrics";

describe("calculateFieldMetrics", () => {
  it("计算字段准确率、归一化准确率、证据覆盖率、复核召回率和平均延迟", () => {
    const metrics = calculateFieldMetrics([
      {
        fieldKey: "diagnosis",
        groundTruthValue: "肺癌",
        predictedValue: "肺癌",
        normalizedGroundTruthValue: "lung_cancer",
        normalizedPredictedValue: "lung_cancer",
        evidence: ["病理诊断提示肺癌"],
        expectedNeedsReview: true,
        actualNeedsReview: true,
        latencyMs: 120
      },
      {
        fieldKey: "smokingHistory",
        groundTruthValue: "否认吸烟",
        predictedValue: "吸烟",
        normalizedGroundTruthValue: false,
        normalizedPredictedValue: true,
        evidence: [],
        expectedNeedsReview: true,
        actualNeedsReview: false,
        latencyMs: 80
      },
      {
        fieldKey: "age",
        groundTruthValue: 60,
        predictedValue: 60,
        evidence: ["年龄60岁"],
        expectedNeedsReview: false,
        actualNeedsReview: true
      }
    ]);

    expect(metrics).toEqual({
      sampleCount: 3,
      fieldAccuracy: 2 / 3,
      normalizedAccuracy: 0.5,
      evidenceCoverage: 2 / 3,
      needsReviewRecall: 0.5,
      averageLatencyMs: 100
    });
  });

  it("缺少预测值或字段 key 时仍纳入字段准确率分母，但不会制造证据或延迟分母", () => {
    const metrics = calculateFieldMetrics([
      {
        fieldKey: "subjectCode",
        groundTruthValue: "示例患者A",
        evidence: undefined,
        expectedNeedsReview: false,
        actualNeedsReview: false
      },
      {
        groundTruthValue: "男",
        predictedValue: "男",
        evidence: ["性别男"],
        expectedNeedsReview: false,
        actualNeedsReview: false,
        latencyMs: undefined
      }
    ]);

    expect(metrics).toMatchObject({
      sampleCount: 2,
      fieldAccuracy: 0.5,
      evidenceCoverage: 0.5,
      needsReviewRecall: null,
      averageLatencyMs: null
    });
  });

  it("空样本或没有可计算分母时返回 null，避免把无数据误报为 0 分", () => {
    const metrics = calculateFieldMetrics([]);

    expect(metrics).toEqual({
      sampleCount: 0,
      fieldAccuracy: null,
      normalizedAccuracy: null,
      evidenceCoverage: null,
      needsReviewRecall: null,
      averageLatencyMs: null
    });
  });
});
