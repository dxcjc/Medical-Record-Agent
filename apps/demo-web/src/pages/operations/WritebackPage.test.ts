import { describe, expect, it, vi } from "vitest";

import {
  createWritebackRequest,
  loadEligibleWritebackJobs,
  normalizeApiJobToWritebackJob,
  normalizeEligibleWritebackItem
} from "./WritebackPage";

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

  it("从真实编排结果提取 readyFields，并生成生产写回 executor 可消费的请求体", () => {
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
      confirmed: true,
      fields: [
        {
          fieldKey: "clinicalDiagnosis",
          targetPath: "clinicalInfo.clinicalDiagnosis",
          value: "肺腺癌"
        }
      ],
      payload: expect.objectContaining({
        jobId: "job-003",
        source: "api.getJob/getResult"
      })
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
    expect(createWritebackRequest(job)).toEqual(
      expect.objectContaining({
        jobId: "job-eligible-001",
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "肺腺癌"
          }
        ]
      })
    );
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

  it("API 失败时保留现有兜底列表和选中任务，并返回可展示错误", async () => {
    const fallbackJobs = [
      {
        id: "WB-DEMO-001",
        subject: "Demo 任务",
        target: "LIMS" as const,
        extractedFields: 1,
        greenRules: [],
        blockers: [],
        status: "ready" as const,
        permission: "allowed" as const,
        payload: {}
      }
    ];

    const result = await loadEligibleWritebackJobs(
      {
        listEligibleWritebacks: vi.fn(async () => {
          throw new Error("ELIGIBLE_API_DOWN");
        })
      },
      fallbackJobs,
      "WB-DEMO-001"
    );

    expect(result).toEqual({
      jobs: fallbackJobs,
      selectedJobId: "WB-DEMO-001",
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
