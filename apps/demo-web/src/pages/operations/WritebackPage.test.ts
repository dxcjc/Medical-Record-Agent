import { describe, expect, it, vi } from "vitest";

import {
  createWritebackRequest,
  describeWritebackExecutionState,
  isExplicitDemoMode,
  loadEligibleWritebackJobs,
  normalizeApiJobToWritebackJob,
  normalizeEligibleWritebackItem
} from "./WritebackPage";

describe("isExplicitDemoMode", () => {
  it("只有 VITE_DEMO_MODE=true 时允许静态演示数据", () => {
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: "true" })).toBe(true);
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: "false" })).toBe(false);
    expect(isExplicitDemoMode({ VITE_DEMO_MODE: undefined })).toBe(false);
  });
});

describe("normalizeApiJobToWritebackJob", () => {
  it("从真实识别结果的 normalizedFields 读取可写回字段数量", () => {
    const job = normalizeApiJobToWritebackJob(
      "job-001",
      {
        id: "job-001",
        status: "completed",
        schemaKey: "lims-clinical-info"
      },
      {
        normalizedFields: [
          { fieldKey: "clinicalDiagnosis", value: "肺腺癌" },
          { fieldKey: "sampleType", value: "组织" }
        ],
        payload: {
          validation: {
            normalizedCandidates: [
              { fieldKey: "clinicalDiagnosis", value: "肺腺癌" }
            ]
          }
        }
      }
    );

    expect(job.extractedFields).toBe(2);
    expect(job.status).toBe("ready");
  });

  it("兼容编排 payload.validation.normalizedCandidates 作为真实可写回字段来源", () => {
    const job = normalizeApiJobToWritebackJob(
      "job-002",
      {
        id: "job-002",
        status: "completed"
      },
      {
        payload: {
          validation: {
            normalizedCandidates: [
              { fieldKey: "clinicalDiagnosis", value: "肺腺癌" },
              { fieldKey: "sampleType", value: "组织" },
              { fieldKey: "tumorType", value: "肺癌" }
            ]
          }
        }
      }
    );

    expect(job.extractedFields).toBe(3);
  });

  it("生成写回请求时只提交 jobId 和 confirmed，不携带客户端 fields/payload", () => {
    const job = normalizeApiJobToWritebackJob(
      "job-003",
      {
        id: "job-003",
        status: "completed"
      },
      {
        payload: {
          writeback: {
            readyFields: [
              {
                fieldKey: "clinicalDiagnosis",
                targetPath: "clinicalInfo.clinicalDiagnosis",
                value: "肺腺癌"
              }
            ]
          },
          validation: {
            normalizedCandidates: [
              {
                fieldKey: "clinicalDiagnosis",
                value: "肺腺癌"
              }
            ]
          }
        }
      }
    );

    expect(createWritebackRequest(job)).toEqual({
      jobId: "job-003",
      confirmed: true
    });
  });

  it("把后端 eligible writeback item 归一成页面可执行任务", () => {
    const job = normalizeEligibleWritebackItem({
      id: "job-eligible-001",
      schemaKey: "custom-clinical-schema",
      sourceFileId: "file-001",
      extractedFields: 1,
      readyFields: [
        {
          fieldKey: "clinicalDiagnosis",
          targetPath: "clinicalInfo.clinicalDiagnosis",
          value: "肺腺癌"
        }
      ],
      blockers: [],
      payload: {
        jobId: "job-eligible-001",
        source: "writeback.eligible",
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "肺腺癌"
          }
        ]
      }
    });

    expect(job).toEqual(
      expect.objectContaining({
        id: "job-eligible-001",
        subject: "file-001 / custom-clinical-schema",
        extractedFields: 1,
        status: "ready",
        permission: "allowed",
        payload: expect.objectContaining({
          fields: [
            {
              fieldKey: "clinicalDiagnosis",
              targetPath: "clinicalInfo.clinicalDiagnosis",
              value: "肺腺癌"
            }
          ]
        })
      })
    );
    expect(createWritebackRequest(job)).toEqual({
      jobId: "job-eligible-001",
      confirmed: true
    });
  });
});

describe("describeWritebackExecutionState", () => {
  it("写回执行状态提供处理中、取消、失败重试和恢复文案", () => {
    expect(describeWritebackExecutionState({ kind: "running", jobId: "job-001", target: "LIMS" })).toEqual({
      tone: "info",
      title: "写回执行中",
      message: "job-001 正在写回 LIMS，已锁定当前确认任务。",
      canCancel: true,
      canRetry: false
    });

    expect(describeWritebackExecutionState({ kind: "cancelled", jobId: "job-001" })).toEqual({
      tone: "warning",
      title: "写回已取消",
      message: "job-001 写回已取消，任务状态已恢复，可重新确认后重跑。",
      canCancel: false,
      canRetry: true
    });

    expect(describeWritebackExecutionState({ kind: "failed", jobId: "job-001", errorMessage: "LIMS_TIMEOUT" })).toEqual({
      tone: "warning",
      title: "写回失败",
      message: "job-001 写回失败：LIMS_TIMEOUT。请检查 LIMS Provider 健康状态后重跑。",
      canCancel: false,
      canRetry: true
    });
  });
});

describe("loadEligibleWritebackJobs", () => {
  it("API 成功时把真实候选排在列表前面，并按 limit 读取 eligible 端点", async () => {
    const listEligibleWritebacks = vi.fn(async () => ({
      items: [
        {
          id: "job-eligible-001",
          schemaKey: "custom-clinical-schema",
          sourceFileId: "file-001",
          readyFields: [
            {
              fieldKey: "clinicalDiagnosis",
              targetPath: "clinicalInfo.clinicalDiagnosis",
              value: "肺腺癌"
            }
          ]
        }
      ]
    }));

    const result = await loadEligibleWritebackJobs(
      { listEligibleWritebacks },
      [
        {
          id: "WB-DEMO-001",
          subject: "Demo 任务",
          target: "LIMS",
          extractedFields: 1,
          greenRules: [],
          blockers: [],
          status: "ready",
          permission: "allowed",
          payload: {}
        }
      ],
      "WB-DEMO-001",
      10
    );

    expect(listEligibleWritebacks).toHaveBeenCalledWith(10);
    expect(result.state).toBe("success");
    expect(result.jobs.map((job) => job.id)).toEqual(["job-eligible-001", "WB-DEMO-001"]);
    expect(result.selectedJobId).toBe("WB-DEMO-001");
  });

  it("API 失败时不注入静态 demo 兜底，并返回可展示错误", async () => {
    const result = await loadEligibleWritebackJobs(
      {
        listEligibleWritebacks: vi.fn(async () => {
          throw new Error("ELIGIBLE_API_DOWN");
        })
      },
      [],
      ""
    );

    expect(result).toEqual({
      jobs: [],
      selectedJobId: "",
      state: "error",
      errorMessage: "ELIGIBLE_API_DOWN"
    });
  });

  it("手动 jobId 已加载并选中时，eligible 刷新不会改掉当前选中任务", async () => {
    const currentJobs = [
      {
        id: "job-manual-001",
        subject: "手动加载任务",
        target: "LIMS" as const,
        extractedFields: 2,
        greenRules: [],
        blockers: [],
        status: "ready" as const,
        permission: "allowed" as const,
        payload: { source: "api.getJob/getResult" }
      }
    ];

    const result = await loadEligibleWritebackJobs(
      {
        listEligibleWritebacks: vi.fn(async () => ({
          items: [
            {
              id: "job-eligible-002",
              schemaKey: "custom-clinical-schema",
              sourceFileId: "file-002",
              readyFields: []
            }
          ]
        }))
      },
      currentJobs,
      "job-manual-001"
    );

    expect(result.jobs.map((job) => job.id)).toEqual(["job-eligible-002", "job-manual-001"]);
    expect(result.selectedJobId).toBe("job-manual-001");
  });
});
