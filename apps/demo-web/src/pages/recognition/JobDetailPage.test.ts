import { describe, expect, it } from "vitest";

import {
  buildReviewFieldRows,
  buildReviewSummary,
  buildTaskTimeline,
  isExplicitDemoMode,
  parseApiDetail,
} from "./JobDetailPage";

describe("isExplicitDemoMode", () => {
  it("只有 VITE_DEMO_MODE=true 时允许详情页静态演示数据", () => {
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: "true" })).toBe(true);
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: "false" })).toBe(false);
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: undefined })).toBe(false);
  });
});

describe("parseApiDetail", () => {
  it("从真实任务响应里读取 sourceFileId 供原始文档预览使用", () => {
    const detail = parseApiDetail(
      {
        id: "job-001",
        sourceFileId: "file-001"
      },
      {
        fields: []
      }
    );

    expect(detail).toEqual(
      expect.objectContaining({
        jobId: "job-001",
        sourceFileId: "file-001"
      })
    );
  });

  it("把真实 core RecognitionResult 的字段候选和嵌套证据转成详情页可展示数据", () => {
    const detail = parseApiDetail(
      {
        id: "job-001",
        sourceFileId: "file-001"
      },
      {
        ocrText: "诊断：肺腺癌",
        fieldCandidates: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "肺腺癌",
            rawValue: "肺腺癌",
            confidence: 0.92,
            evidence: [
              {
                ocrBlockId: "block-001",
                pageNumber: 2,
                snippet: "诊断：肺腺癌"
              }
            ]
          }
        ]
      }
    );

    expect(detail.fields).toEqual([
      {
        field: "clinicalDiagnosis",
        value: "肺腺癌",
        confidence: 0.92,
        source: "第 2 页 block-001",
        decision: "green"
      }
    ]);
    expect(detail.evidence).toEqual([
      {
        id: "block-001",
        field: "clinicalDiagnosis",
        quote: "诊断：肺腺癌",
        page: 2,
        confidence: 0.92
      }
    ]);
  });
});

describe("review workspace helpers", () => {
  it("汇总详情页第一屏需要展示的任务结论", () => {
    expect(
      buildReviewSummary({
        status: "needs_review",
        fields: [
          { field: "主诉", value: "咳嗽", confidence: 0.93, source: "第 1 页 block-1", decision: "green" },
          { field: "现病史", value: "", confidence: 0.42, source: "第 1 页 block-2", decision: "yellow" },
          { field: "过敏史", value: "", confidence: 0.2, source: "第 2 页 block-4", decision: "red" }
        ],
        evidence: [
          { id: "block-1", field: "主诉", quote: "主诉：咳嗽", page: 1, confidence: 0.93 }
        ],
        ocrText: "主诉：咳嗽"
      })
    ).toEqual({
      statusLabel: "等待复核",
      pendingFieldCount: 2,
      highConfidenceFieldCount: 1,
      warningCount: 2,
      evidenceCount: 1,
      hasOcrText: true
    });
  });

  it("字段列表默认把待处理字段排在已通过字段前面", () => {
    expect(
      buildReviewFieldRows([
        { field: "主诉", value: "咳嗽", confidence: 0.93, source: "第 1 页 block-1", decision: "green" },
        { field: "过敏史", value: "", confidence: 0.2, source: "第 2 页 block-4", decision: "red" },
        { field: "现病史", value: "发热", confidence: 0.61, source: "第 1 页 block-2", decision: "yellow" }
      ]).map((row) => row.field)
    ).toEqual(["过敏史", "现病史", "主诉"]);
  });
});

describe("buildTaskTimeline", () => {
  it("把任务状态映射成用户可读的识别进度时间线", () => {
    expect(buildTaskTimeline("ocr_running")).toEqual([
      { key: "uploaded", label: "上传完成", status: "done" },
      { key: "stored", label: "文件保存完成", status: "done" },
      { key: "ocr", label: "PaddleOCR 识别中", status: "active" },
      { key: "extract", label: "模型抽取", status: "pending" },
      { key: "validate", label: "字段校验", status: "pending" },
      { key: "review", label: "等待复核", status: "pending" }
    ]);

    expect(buildTaskTimeline("failed", "模型 API Key 无效").find((item) => item.status === "failed")).toEqual({
      key: "failed",
      label: "识别失败",
      status: "failed",
      message: "模型 API Key 无效"
    });
  });
});
