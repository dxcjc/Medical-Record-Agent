import { describe, expect, it } from "vitest";

import { isExplicitDemoMode, parseApiDetail } from "./JobDetailPage";

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
