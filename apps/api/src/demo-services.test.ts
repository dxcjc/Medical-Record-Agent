import { describe, expect, it } from "vitest";

import { createDemoApiServices } from "./demo-services";

function readRecordId(value: unknown) {
  if (!value || typeof value !== "object" || !("id" in value)) {
    throw new Error("Demo service did not return a job id");
  }

  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Demo service returned an invalid job id");
  }

  return id;
}

describe("createDemoApiServices recognition closure", () => {
  it("demo provider 列表不再向业务 API 返回内部 mock provider", async () => {
    const services = createDemoApiServices();

    const providers = await services.providerService.listProviders();

    expect(JSON.stringify(providers)).not.toContain("mock-ocr");
    expect(JSON.stringify(providers)).not.toContain("mock-model");
    expect(JSON.stringify(providers)).not.toContain("development_placeholder");
    expect(providers).toEqual([
      expect.objectContaining({
        key: "local-storage",
        kind: "storage"
      }),
      expect.objectContaining({
        key: "lims-writeback",
        kind: "lims"
      }),
      expect.objectContaining({
        key: "paddle-ocr",
        kind: "ocr"
      }),
      expect.objectContaining({
        key: "gpt5-llm",
        kind: "llm"
      }),
      expect.objectContaining({
        key: "configured-ocr-provider",
        kind: "ocr"
      }),
      expect.objectContaining({
        key: "configured-llm-provider",
        kind: "llm"
      }),
      expect.objectContaining({
        key: "configured-storage-provider",
        kind: "storage"
      })
    ]);
  });

  it("demo provider health 不接受内部 mock provider key", async () => {
    const services = createDemoApiServices();

    await expect(services.providerService.checkProviderHealth({ key: "mock-ocr", actor: {} as never })).rejects.toMatchObject({
      code: "PROVIDER_NOT_FOUND",
      statusCode: 404
    });
  });

  it("demo API 走 mock 编排闭环创建识别任务", async () => {
    const services = createDemoApiServices();

    const result = await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-001",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

    expect(result.status).toBe("completed");
    expect(result.id).toMatch(/^job-demo-/);
  });

  it("demo 内部测试编排保留在非用户业务入口", async () => {
    const services = createDemoApiServices();
    const job = await services.internalTestRecognitionService.createWithSyntheticProviders({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-001",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

    const jobId = readRecordId(job);
    const result = await services.resultService.getByJobId(jobId);

    expect(job).toEqual(
      expect.objectContaining({
        id: "job-demo-1",
        status: "completed",
        trace: expect.arrayContaining([
          expect.objectContaining({
            status: "queued"
          }),
          expect.objectContaining({
            status: "running"
          }),
          expect.objectContaining({
            status: "completed"
          })
        ])
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        jobId: "job-demo-1",
        status: "completed",
        ocr: expect.objectContaining({
          providerName: "fixture-ocr"
        }),
        extraction: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              fieldKey: "clinicalDiagnosis",
              value: "模拟诊断"
            })
          ])
        })
      })
    );
  });

  it("demo API 不再对不存在的 jobId 静默返回固定假结果", async () => {
    const services = createDemoApiServices();

    await expect(services.jobService.get("missing-job")).resolves.toBeNull();
    await expect(services.resultService.getByJobId("missing-job")).resolves.toBeNull();
  });
});
