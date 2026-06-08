import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FEEDBACK_EVALUATION_DATASET_ID,
  buildFeedbackEvaluationSample,
  submitFeedbackSampleStatus
} from "./FeedbackSamplesPage";

describe("FeedbackSamplesPage 入评估集桥接", () => {
  it("入集时先保存 feedback，再导入一条最小 evaluation sample", async () => {
    const createFeedback = vi.fn(async () => ({ feedbackId: "feedback-api-001" }));
    const importEvaluationSamples = vi.fn(async () => ({ samples: [{ id: "eval-sample-001" }] }));

    const result = await submitFeedbackSampleStatus(
      {
        createFeedback,
        importEvaluationSamples
      },
      {
        id: "FB-1187",
        source: "门诊病历 OCR",
        field: "出院日期",
        expected: "2026-05-28",
        actual: "",
        label: "字段缺失",
        status: "new",
        confidence: 0.61,
        payload: { reviewer: "reviewer-a", page: 3 }
      },
      "golden"
    );

    expect(createFeedback).toHaveBeenCalledWith({
      sampleId: "FB-1187",
      source: "门诊病历 OCR",
      field: "出院日期",
      expected: "2026-05-28",
      actual: "",
      label: "字段缺失",
      status: "golden",
      payload: { reviewer: "reviewer-a", page: 3 }
    });
    expect(importEvaluationSamples).toHaveBeenCalledWith(DEFAULT_FEEDBACK_EVALUATION_DATASET_ID, [
      {
        externalId: "feedback-FB-1187",
        input: {
          source: "门诊病历 OCR",
          field: "出院日期",
          actual: ""
        },
        groundTruth: {
          出院日期: {
            fieldKey: "出院日期",
            value: "2026-05-28",
            normalizedValue: "2026-05-28",
            expectedNeedsReview: true
          }
        },
        metadata: {
          feedbackSampleId: "FB-1187",
          source: "门诊病历 OCR",
          field: "出院日期",
          reviewer: "reviewer-a",
          feedbackApiId: "feedback-api-001",
          feedbackLabel: "字段缺失",
          feedbackStatus: "golden"
        }
      }
    ]);
    expect(result).toEqual({
      status: "success",
      apiFeedbackId: "feedback-api-001",
      message: "已入评估集，feedback feedback-api-001 已保存。"
    });
  });

  it("feedback 保存成功但 evaluation sample 导入失败时返回清晰失败文案", async () => {
    const createFeedback = vi.fn(async () => ({ id: "feedback-api-002" }));
    const importEvaluationSamples = vi.fn(async () => {
      throw new Error("DATASET_NOT_FOUND");
    });

    const result = await submitFeedbackSampleStatus(
      {
        createFeedback,
        importEvaluationSamples
      },
      {
        id: "FB-1186",
        source: "检验申请单",
        field: "检验项目",
        expected: "NGS-肺癌 520 基因",
        actual: "NGS-肺癌 52O 基因",
        label: "识别错误",
        status: "triaged",
        confidence: 0.79,
        payload: {}
      },
      "golden"
    );

    expect(createFeedback).toHaveBeenCalledTimes(1);
    expect(importEvaluationSamples).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "evaluation-import-error",
      apiFeedbackId: "feedback-api-002",
      message: "feedback 已保存，但样本导入失败：DATASET_NOT_FOUND"
    });
  });

  it("忽略样本只保存 feedback，不导入 evaluation sample", async () => {
    const createFeedback = vi.fn(async () => ({ id: "feedback-api-003" }));
    const importEvaluationSamples = vi.fn(async () => ({ samples: [] }));

    const result = await submitFeedbackSampleStatus(
      {
        createFeedback,
        importEvaluationSamples
      },
      {
        id: "FB-1185",
        source: "住院首页",
        field: "诊断列表",
        expected: "肺恶性肿瘤；高血压",
        actual: "肺恶性肿瘤高血压",
        label: "结构错位",
        status: "new",
        confidence: 0.84,
        payload: {}
      },
      "ignored"
    );

    expect(importEvaluationSamples).not.toHaveBeenCalled();
    expect(result.message).toBe("已保存 feedback feedback-api-003，页面状态已同步。");
  });

  it("字段和值不足时安全降级生成最小 groundTruth，不让页面动作崩溃", () => {
    const sample = buildFeedbackEvaluationSample(
      {
        id: "FB-EMPTY",
        source: "",
        field: "",
        expected: "",
        actual: "",
        label: "可接受",
        status: "new",
        confidence: 0.5,
        payload: {}
      },
      undefined
    );

    expect(sample.groundTruth).toEqual({
      feedbackValue: {
        fieldKey: "feedbackValue",
        value: "",
        normalizedValue: "",
        expectedNeedsReview: true
      }
    });
    expect(sample.metadata).toEqual({
      feedbackSampleId: "FB-EMPTY",
      source: "feedback",
      field: "feedbackValue",
      reviewer: "unknown",
      feedbackLabel: "可接受",
      feedbackStatus: "golden"
    });
  });
});
