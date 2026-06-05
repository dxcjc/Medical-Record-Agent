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
    permissions: ["lims.writeback"],
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
});
