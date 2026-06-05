import { describe, expect, it, vi } from "vitest";

import { runEvaluation } from "./evaluationRunner";

describe("runEvaluation", () => {
  it("逐样本运行 synthetic 数据集并汇总字段指标", async () => {
    const nowValues = [100, 125, 150, 200, 260, 260];
    const recognition = vi.fn(async ({ sample }: { sample: { id: string } }) => {
      if (sample.id === "sample-1") {
        return {
          fields: {
            diagnosis: {
              value: "肺癌",
              normalizedValue: "lung_cancer",
              evidence: ["病理诊断提示肺癌"],
              needsReview: true
            }
          },
          warnings: ["sample-1 证据较短"]
        };
      }

      return {
        fields: {
          diagnosis: {
            value: "吸烟",
            normalizedValue: true,
            evidence: [],
            needsReview: false
          }
        }
      };
    });

    const result = await runEvaluation({
      dataset: {
        id: "dataset-synthetic",
        sensitivity: "synthetic",
        samples: [
          {
            id: "sample-1",
            input: { text: "患者诊断为肺癌" },
            groundTruth: {
              diagnosis: {
                value: "肺癌",
                normalizedValue: "lung_cancer",
                expectedNeedsReview: true
              }
            }
          },
          {
            id: "sample-2",
            input: { text: "否认吸烟" },
            groundTruth: {
              diagnosis: {
                value: "否认吸烟",
                normalizedValue: false,
                expectedNeedsReview: true
              }
            }
          }
        ]
      },
      schemaConfig: { schemaName: "clinical" },
      providerConfig: { providerName: "mock" },
      recognition,
      now: () => nowValues.shift() ?? 0
    });

    expect(recognition).toHaveBeenCalledTimes(2);
    expect(recognition).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sample: expect.objectContaining({ id: "sample-1" }),
        schemaConfig: { schemaName: "clinical" },
        providerConfig: { providerName: "mock" }
      })
    );
    expect(result.summary).toEqual({
      datasetId: "dataset-synthetic",
      totalSamples: 2,
      completedSamples: 2,
      failedSamples: 0,
      totalFieldSamples: 2,
      startedAtMs: 100,
      finishedAtMs: 260,
      durationMs: 160
    });
    expect(result.metrics).toEqual({
      sampleCount: 2,
      fieldAccuracy: 0.5,
      normalizedAccuracy: 0.5,
      evidenceCoverage: 0.5,
      needsReviewRecall: 0.5,
      averageLatencyMs: 42.5
    });
    expect(result.sampleResults).toEqual([
      expect.objectContaining({
        sampleId: "sample-1",
        status: "completed",
        latencyMs: 25,
        fieldResults: [
          {
            fieldKey: "diagnosis",
            groundTruthValue: "肺癌",
            predictedValue: "肺癌",
            normalizedGroundTruthValue: "lung_cancer",
            normalizedPredictedValue: "lung_cancer",
            evidence: ["病理诊断提示肺癌"],
            expectedNeedsReview: true,
            actualNeedsReview: true,
            latencyMs: 25
          }
        ],
        warnings: ["sample-1 证据较短"]
      }),
      expect.objectContaining({
        sampleId: "sample-2",
        status: "completed",
        latencyMs: 60
      })
    ]);
    expect(result.warnings).toEqual([
      {
        sampleId: "sample-1",
        message: "sample-1 证据较短"
      }
    ]);
    expect(result.errors).toEqual([]);
  });

  it("拒绝未脱敏的真实数据集并且不会调用 recognition", async () => {
    const recognition = vi.fn();

    await expect(
      runEvaluation({
        dataset: {
          id: "dataset-real",
          sensitivity: "real",
          samples: [
            {
              id: "sample-1",
              input: { text: "未脱敏示例文本" },
              groundTruth: {
                diagnosis: { value: "肺癌" }
              }
            }
          ]
        },
        schemaConfig: {},
        providerConfig: {},
        recognition
      })
    ).rejects.toThrow("数据集 dataset-real 标记为 real，但 deidentified 不是 true，评估运行器拒绝处理未脱敏真实样本");

    expect(recognition).not.toHaveBeenCalled();
  });

  it("单个样本识别失败时记录 error，其他样本仍可完成并参与指标汇总", async () => {
    const nowValues = [10, 30, 50, 50, 65, 65];
    const recognition = vi.fn(async ({ sample }: { sample: { id: string } }) => {
      if (sample.id === "sample-failed") {
        throw new Error("模型超时");
      }

      return {
        fields: {
          subjectCode: {
            value: "示例患者A",
            evidence: ["样本代号示例患者A"],
            needsReview: false
          }
        }
      };
    });

    const result = await runEvaluation({
      dataset: {
        id: "dataset-partial",
        sensitivity: "synthetic",
        samples: [
          {
            id: "sample-ok",
            input: { text: "样本代号示例患者A" },
            groundTruth: {
              subjectCode: { value: "示例患者A", expectedNeedsReview: false }
            }
          },
          {
            id: "sample-failed",
            input: { text: "识别会失败" },
            groundTruth: {
              subjectCode: { value: "示例患者B", expectedNeedsReview: true }
            }
          }
        ]
      },
      schemaConfig: {},
      providerConfig: {},
      recognition,
      now: () => nowValues.shift() ?? 0
    });

    expect(result.summary).toEqual({
      datasetId: "dataset-partial",
      totalSamples: 2,
      completedSamples: 1,
      failedSamples: 1,
      totalFieldSamples: 1,
      startedAtMs: 10,
      finishedAtMs: 65,
      durationMs: 55
    });
    expect(result.metrics).toMatchObject({
      sampleCount: 1,
      fieldAccuracy: 1,
      evidenceCoverage: 1,
      averageLatencyMs: 20
    });
    expect(result.sampleResults).toEqual([
      expect.objectContaining({
        sampleId: "sample-ok",
        status: "completed",
        latencyMs: 20
      }),
      {
        sampleId: "sample-failed",
        status: "failed",
        latencyMs: 15,
        fieldResults: [],
        warnings: [],
        error: "模型超时"
      }
    ]);
    expect(result.errors).toEqual([
      {
        sampleId: "sample-failed",
        message: "模型超时"
      }
    ]);
  });
});
