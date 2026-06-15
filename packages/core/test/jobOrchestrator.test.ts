import { describe, expect, it, vi } from "vitest";

import {
  ProviderError,
  createDefaultMedicalKnowledgeBase,
  createInMemoryJobRepository,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createMockModelProvider,
  createMockOcrProvider,
  limsClinicalInfoSchema,
  type JobOrchestratorResult,
  type ModelFieldCandidate,
  type OcrProvider,
  type WritebackExecutor
} from "../src/index";

const demoDocument = {
  documentId: "demo-document-task-8",
  fileName: "demo-record-task-8.pdf",
  mimeType: "application/pdf"
};

function candidate(overrides: Partial<ModelFieldCandidate> = {}): ModelFieldCandidate {
  return {
    fieldKey: "clinicalDiagnosis",
    value: "DEMO_DIAGNOSIS_A",
    rawValue: "诊断：DEMO_DIAGNOSIS_A",
    confidence: 0.94,
    evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 10, endOffset: 31, pageNumber: 1 }],
    ...overrides
  };
}

function createOcrProvider(): OcrProvider {
  return createMockOcrProvider({
    blocks: [
      {
        page: 1,
        blockId: "demo-block-1",
        text: "DEMO_CASE_TASK_8：诊断：DEMO_DIAGNOSIS_A；样本类型：组织。",
        confidence: 0.98,
        coordinates: { x: 0, y: 0, width: 100, height: 20 }
      }
    ]
  });
}

function createAutoSchema() {
  return {
    ...limsClinicalInfoSchema,
    fields: limsClinicalInfoSchema.fields.map((field) =>
      field.key === "sampleType"
        ? { ...field, adapterHints: { ...field.adapterHints, writebackMode: "auto" as const } }
        : field
    )
  };
}

function createBaseOrchestrator(options: {
  candidates: ModelFieldCandidate[];
  writebackExecutor?: WritebackExecutor;
  autoWritebackEnabled?: boolean;
  schema?: typeof limsClinicalInfoSchema;
}) {
  const repository = createInMemoryJobRepository();
  const orchestrator = createJobOrchestrator({
    repository,
    schema: options.schema ?? limsClinicalInfoSchema,
    ocrProvider: createOcrProvider(),
    modelProvider: createMockModelProvider({ candidates: options.candidates }),
    knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
    permissions: ["writeback:execute"],
    autoWritebackEnabled: options.autoWritebackEnabled ?? false,
    writebackExecutor: options.writebackExecutor
  });

  return { orchestrator, repository };
}

describe("job orchestrator", () => {
  it("completes green recognition with mock providers and persists status transitions", async () => {
    const { orchestrator, repository } = createBaseOrchestrator({
      candidates: [candidate()]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-completed",
      document: demoDocument
    });

    expect(result.status).toBe("completed");
    expect(result.autoDecision.decision).toBe("green");
    expect(result.trace.map((event) => event.node)).toEqual([
      "preprocess",
      "ocr",
      "rag",
      "extraction",
      "validation",
      "autoDecision",
      "writeback",
      "evaluation"
    ]);
    expect(repository.getTransitions("demo-job-completed").map((transition) => transition.status)).toEqual([
      "queued",
      "running",
      "completed"
    ]);
  });

  it("marks partial_completed when optional fields are low confidence but required fields pass", async () => {
    const { orchestrator } = createBaseOrchestrator({
      candidates: [
        candidate(),
        candidate({
          fieldKey: "tumorStage",
          value: "IV期",
          rawValue: "IV期",
          confidence: 0.6,
          evidence: [{ snippet: "IV期", startOffset: 40, endOffset: 43, pageNumber: 1 }]
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-partial",
      document: demoDocument
    });

    expect(result.status).toBe("partial_completed");
    expect(result.autoDecision.decision).toBe("yellow");
    expect(result.validation.fieldResults.find((field) => field.fieldKey === "tumorStage")?.decision).toBe("needs_review");
  });

  it("normalizes enum labels and warns about conflicting candidates", async () => {
    const { orchestrator } = createBaseOrchestrator({
      candidates: [
        candidate(),
        candidate({
          fieldKey: "sampleType",
          value: "组织",
          rawValue: "样本类型：组织",
          confidence: 0.94,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        }),
        candidate({
          fieldKey: "sampleType",
          value: "blood",
          rawValue: "样本类型：血液",
          confidence: 0.91,
          evidence: [{ snippet: "样本类型：血液", startOffset: 45, endOffset: 51, pageNumber: 1 }]
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-enum-conflict",
      document: demoDocument
    });

    expect(result.status).toBe("partial_completed");
    expect(result.validation.normalizedCandidates.find((item) => item.rawValue === "样本类型：组织")?.value).toBe("tissue");
    expect(result.validation.fieldResults.find((field) => field.fieldKey === "sampleType")?.issues).toContainEqual(
      expect.objectContaining({ code: "CONFLICTING_CANDIDATES" })
    );
  });

  it("marks needs_review when key fields are low confidence or missing evidence", async () => {
    const { orchestrator } = createBaseOrchestrator({
      candidates: [candidate({ confidence: 0.5, evidence: [] })]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-needs-review",
      document: demoDocument
    });

    expect(result.status).toBe("needs_review");
    expect(result.autoDecision.decision).toBe("red");
    expect(result.autoDecision.reasons).toContainEqual(expect.objectContaining({ code: "KEY_FIELD_NOT_ACCEPTED" }));
  });

  it("uses schema required and critical field metadata instead of a fixed clinicalDiagnosis key", async () => {
    const schema = {
      ...limsClinicalInfoSchema,
      fields: [
        {
          key: "clinicalDiagnosis",
          label: "临床诊断",
          type: "string" as const,
          comments: ["在这个自定义 schema 中只是普通可选字段。"]
        },
        {
          key: "accessionNumber",
          label: "受理号",
          type: "string" as const,
          required: true,
          critical: true,
          comments: ["自定义业务主键，缺失或未通过时必须阻断自动通过。"]
        }
      ]
    };
    const { orchestrator } = createBaseOrchestrator({
      schema,
      candidates: [
        candidate({
          fieldKey: "clinicalDiagnosis",
          confidence: 0.5,
          evidence: []
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-schema-required-critical",
      document: demoDocument
    });

    expect(result.status).toBe("needs_review");
    expect(result.validation.missingRequiredFieldKeys).toEqual(["accessionNumber"]);
    expect(result.autoDecision.decision).toBe("red");
    expect(result.autoDecision.reasons).toContainEqual(
      expect.objectContaining({ code: "KEY_FIELD_NOT_ACCEPTED", fieldKey: "accessionNumber" })
    );
    expect(result.autoDecision.reasons).toContainEqual(
      expect.objectContaining({ code: "OPTIONAL_FIELD_NEEDS_REVIEW", fieldKey: "clinicalDiagnosis" })
    );
  });

  it("marks writeback_pending when green auto writeback is enabled but executor is deferred", async () => {
    const { orchestrator } = createBaseOrchestrator({
      schema: createAutoSchema(),
      autoWritebackEnabled: true,
      candidates: [
        candidate(),
        candidate({
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.94,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-writeback-pending",
      document: demoDocument
    });

    expect(result.status).toBe("writeback_pending");
    expect(result.writeback.ready).toBe(true);
  });

  it("marks writeback_completed when writeback executor succeeds", async () => {
    const writebackExecutor = vi.fn<WritebackExecutor>(async () => ({
      status: "success",
      receiptId: "DEMO-WRITEBACK-RECEIPT"
    }));
    const { orchestrator } = createBaseOrchestrator({
      schema: createAutoSchema(),
      autoWritebackEnabled: true,
      writebackExecutor,
      candidates: [
        candidate(),
        candidate({
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.94,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-writeback-completed",
      document: demoDocument
    });

    expect(result.status).toBe("writeback_completed");
    expect(writebackExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "demo-job-writeback-completed",
        source: "server-workflow",
        fields: [expect.objectContaining({ fieldKey: "sampleType", value: "tissue" })]
      })
    );
  });

  it("marks writeback_failed when writeback executor returns failure", async () => {
    const writebackExecutor = vi.fn<WritebackExecutor>(async () => ({
      status: "failed",
      retryable: true,
      errorMessage: "DEMO_WRITEBACK_UNAVAILABLE"
    }));
    const { orchestrator } = createBaseOrchestrator({
      schema: createAutoSchema(),
      autoWritebackEnabled: true,
      writebackExecutor,
      candidates: [
        candidate(),
        candidate({
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.94,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        })
      ]
    });

    const result = await orchestrator.start({
      jobId: "demo-job-writeback-failed",
      document: demoDocument
    });

    expect(result.status).toBe("writeback_failed");
    expect(result.error).toEqual(
      expect.objectContaining({
        code: "WRITEBACK_FAILED",
        retryable: true
      })
    );
  });

  it("maps provider errors to failed retryable job errors", async () => {
    const repository = createInMemoryJobRepository();
    const failingOcrProvider: OcrProvider = {
      providerName: "failing-ocr",
      recognize: vi.fn(async () => {
        throw new ProviderError("OCR 服务暂不可用", {
          providerName: "failing-ocr",
          retryable: true,
          code: "OCR_TEMPORARY_FAILURE"
        });
      })
    };
    const orchestrator = createJobOrchestrator({
      repository,
      schema: limsClinicalInfoSchema,
      ocrProvider: failingOcrProvider,
      modelProvider: createMockModelProvider({ candidates: [candidate()] }),
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-failed",
      document: demoDocument
    });

    expect(result.status).toBe("failed");
    expect(result.error).toEqual(
      expect.objectContaining({
        code: "OCR_TEMPORARY_FAILURE",
        providerName: "failing-ocr",
        retryable: true
      })
    );
    expect(repository.getTransitions("demo-job-failed").map((transition) => transition.status)).toEqual([
      "queued",
      "running",
      "failed"
    ]);
  });

  it("can execute the LangGraph workflow directly for graph-level smoke coverage", async () => {
    const { orchestrator } = createBaseOrchestrator({
      candidates: [candidate()]
    });

    const result: JobOrchestratorResult = await orchestrator.workflow.invoke({
      jobId: "demo-job-langgraph-direct",
      document: demoDocument
    });

    expect(result.status).toBe("completed");
    expect(result.trace.map((event) => event.node)).toContain("autoDecision");
  });

  it("merges OCR text from multiple documents and runs one extraction", async () => {
    const ocrCalls: string[] = [];
    const multiDocOcrProvider: OcrProvider = {
      providerName: "multi-doc-ocr",
      recognize: vi.fn(async (input) => {
        ocrCalls.push(input.documentId);
        return {
          providerName: "multi-doc-ocr",
          pages: [
            {
              page: 1,
              text: `OCR text for ${input.documentId}`,
              confidence: 0.95
            }
          ],
          blocks: [
            {
              page: 1,
              blockId: `${input.documentId}-block-1`,
              text: `OCR text for ${input.documentId}`,
              confidence: 0.95,
              coordinates: { x: 0, y: 0, width: 100, height: 20 }
            }
          ],
          qualityWarnings: []
        };
      })
    };

    let capturedOcrText = "";
    const capturingModelProvider = createMockModelProvider({
      candidates: [candidate()]
    });
    const originalExtract = capturingModelProvider.extractFields.bind(capturingModelProvider);
    capturingModelProvider.extractFields = vi.fn(async (request) => {
      capturedOcrText = request.ocrText;
      return originalExtract(request);
    });

    const repository = createInMemoryJobRepository();
    const orchestrator = createJobOrchestrator({
      repository,
      schema: limsClinicalInfoSchema,
      ocrProvider: multiDocOcrProvider,
      modelProvider: capturingModelProvider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-multi-doc",
      document: { documentId: "fallback", fileName: "fallback.png", mimeType: "image/png" },
      documents: [
        { documentId: "doc-1", fileName: "page1.png", mimeType: "image/png" },
        { documentId: "doc-2", fileName: "page2.png", mimeType: "image/png" }
      ]
    });

    expect(result.status).not.toBe("failed");
    expect(ocrCalls).toEqual(["doc-1", "doc-2"]);
    expect(capturedOcrText).toContain("[文件 1: page1.png]");
    expect(capturedOcrText).toContain("OCR text for doc-1");
    expect(capturedOcrText).toContain("[文件 2: page2.png]");
    expect(capturedOcrText).toContain("OCR text for doc-2");
    expect(result.ocr?.pages).toHaveLength(2);
    expect(result.trace.some((event) => event.node === "ocr" && event.status === "completed")).toBe(true);
  });

  it("continues with successful documents when one document OCR fails", async () => {
    const multiDocOcrProvider: OcrProvider = {
      providerName: "partial-ocr",
      recognize: vi.fn(async (input) => {
        if (input.documentId === "doc-fail") {
          throw new ProviderError("OCR 失败", { providerName: "partial-ocr", retryable: false, code: "OCR_FAILED" });
        }
        return {
          providerName: "partial-ocr",
          pages: [{ page: 1, text: `OCR text for ${input.documentId}`, confidence: 0.95 }],
          blocks: [{ page: 1, blockId: "b1", text: "text", confidence: 0.95, coordinates: { x: 0, y: 0, width: 1, height: 1 } }],
          qualityWarnings: []
        };
      })
    };

    let capturedOcrText = "";
    const capturingModelProvider = createMockModelProvider({
      candidates: [candidate()]
    });
    const originalExtract = capturingModelProvider.extractFields.bind(capturingModelProvider);
    capturingModelProvider.extractFields = vi.fn(async (request) => {
      capturedOcrText = request.ocrText;
      return originalExtract(request);
    });

    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: limsClinicalInfoSchema,
      ocrProvider: multiDocOcrProvider,
      modelProvider: capturingModelProvider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-partial-ocr",
      document: { documentId: "fallback", fileName: "fallback.png", mimeType: "image/png" },
      documents: [
        { documentId: "doc-ok", fileName: "ok.png", mimeType: "image/png" },
        { documentId: "doc-fail", fileName: "fail.png", mimeType: "image/png" },
        { documentId: "doc-ok2", fileName: "ok2.png", mimeType: "image/png" }
      ]
    });

    expect(result.status).not.toBe("failed");
    expect(capturedOcrText).toContain("OCR text for doc-ok");
    expect(capturedOcrText).toContain("OCR text for doc-ok2");
    expect(capturedOcrText).toContain("【OCR 识别失败】");
    expect(result.ocr?.qualityWarnings.some((w) => w.message.includes("OCR 识别失败"))).toBe(true);
  });
});
