import { describe, expect, it } from "vitest";

import { parseTraceRunsFromResult } from "./AgentTracePage";

describe("parseTraceRunsFromResult", () => {
  it("从 results.trace 解析 LangGraph 节点并保留原始 payload", () => {
    const runs = parseTraceRunsFromResult("job-demo-1", {
      trace: [
        {
          id: "trace-step-1",
          node: "ocr",
          status: "completed",
          durationMs: 128,
          message: "OCR 已完成。"
        },
        {
          node: "writeback",
          status: "skipped",
          elapsedMs: 42,
          detail: "当前结果不触发自动写回。"
        }
      ],
      payload: {
        schemaKey: "lims-clinical-info"
      }
    });

    expect(runs).toEqual([
      {
        id: "job-demo-1",
        subject: "识别任务 job-demo-1",
        startedAt: "真实接口返回",
        totalMs: 170,
        status: "warning",
        spans: [
          {
            id: "trace-step-1",
            name: "ocr",
            service: "LangGraph",
            durationMs: 128,
            status: "success",
            detail: "OCR 已完成。"
          },
          {
            id: "API-T-2",
            name: "writeback",
            service: "LangGraph",
            durationMs: 42,
            status: "warning",
            detail: "当前结果不触发自动写回。"
          }
        ],
        payload: {
          schemaKey: "lims-clinical-info"
        }
      }
    ]);
  });
});
