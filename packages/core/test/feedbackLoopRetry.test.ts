import { describe, expect, it, vi } from "vitest";

import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryJobRepository,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createMockOcrProvider,
  limsClinicalInfoSchema,
  type ModelFieldCandidate,
  type ModelProvider
} from "../src/index";

const demoDocument = {
  documentId: "retry-demo-doc",
  fileName: "retry-demo.pdf",
  mimeType: "application/pdf"
};

function makeOcrProvider() {
  return createMockOcrProvider({
    blocks: [
      {
        page: 1,
        blockId: "b1",
        text: "受理号：ACC-001；诊断：DEMO_DIAGNOSIS_A。",
        confidence: 0.98,
        coordinates: { x: 0, y: 0, width: 100, height: 20 }
      }
    ]
  });
}

// 构造一个必填字段缺失的 schema：accessionNumber 为 required+critical。
// 保留 >=5 个字段以避免触发 Supervisor 的"字段少简化"规则（会使 maxRetryRounds=1），
// 从而测试默认的 maxRetryRounds=2 反馈循环。
function makeSchemaWithRequiredAccessionNumber() {
  return {
    ...limsClinicalInfoSchema,
    fields: [
      {
        key: "accessionNumber",
        label: "受理号",
        type: "string" as const,
        required: true,
        critical: true,
        comments: ["必填关键字段，用于验证反馈循环重试。"]
      },
      {
        key: "clinicalDiagnosis",
        label: "临床诊断",
        type: "string" as const,
        comments: ["普通字段。"]
      },
      {
        key: "patientName",
        label: "患者姓名",
        type: "string" as const,
        comments: ["普通字段。"]
      },
      {
        key: "hospitalName",
        label: "医院名称",
        type: "string" as const,
        comments: ["普通字段。"]
      },
      {
        key: "reportDate",
        label: "报告日期",
        type: "string" as const,
        comments: ["普通字段。"]
      }
    ]
  };
}

function candidate(fieldKey: string, value: string): ModelFieldCandidate {
  return {
    fieldKey,
    value,
    rawValue: value,
    confidence: 0.94,
    evidence: [{ snippet: value, startOffset: 0, endOffset: value.length, pageNumber: 1 }]
  };
}

describe("feedback loop retry", () => {
  it("retries extraction when required fields are missing and succeeds within maxRetryRounds", async () => {
    let callCount = 0;
    const provider: ModelProvider = {
      providerName: "retry-test-model",
      extractFields: vi.fn(async () => {
        callCount += 1;
        // 第 1、2 次：缺失必填字段 accessionNumber → 触发重试
        // 第 3 次：返回完整候选 → 验证通过
        if (callCount < 3) {
          return {
            providerName: "retry-test-model",
            candidates: [candidate("clinicalDiagnosis", "DEMO_DIAGNOSIS_A")]
          };
        }
        return {
          providerName: "retry-test-model",
          candidates: [
            candidate("accessionNumber", "ACC-001"),
            candidate("clinicalDiagnosis", "DEMO_DIAGNOSIS_A")
          ]
        };
      })
    };

    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: makeSchemaWithRequiredAccessionNumber(),
      ocrProvider: makeOcrProvider(),
      modelProvider: provider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-retry-success",
      document: demoDocument
    });

    // 重试 2 轮后第 3 次抽取成功，验证通过
    expect(result.status).toBe("completed");
    expect(result.autoDecision.decision).toBe("green");
    expect(result.validation.missingRequiredFieldKeys).toEqual([]);
    // 抽取共调用 3 次（初始 + 2 轮重试）
    expect(provider.extractFields).toHaveBeenCalledTimes(3);
  });

  it("stops retrying after maxRetryRounds and falls through to needs_review", async () => {
    // provider 始终不返回必填字段 → 重试耗尽后应进入 needs_review，而非无限循环
    const provider: ModelProvider = {
      providerName: "retry-exhaust-model",
      extractFields: vi.fn(async () => ({
        providerName: "retry-exhaust-model",
        candidates: [candidate("clinicalDiagnosis", "DEMO_DIAGNOSIS_A")]
      }))
    };

    const orchestrator = createJobOrchestrator({
      repository: createInMemoryJobRepository(),
      schema: makeSchemaWithRequiredAccessionNumber(),
      ocrProvider: makeOcrProvider(),
      modelProvider: provider,
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
      permissions: [],
      autoWritebackEnabled: false
    });

    const result = await orchestrator.start({
      jobId: "demo-job-retry-exhausted",
      document: demoDocument
    });

    // 重试耗尽（默认 maxRetryRounds=2）后不再重试，进入 needs_review
    expect(result.status).toBe("needs_review");
    expect(result.autoDecision.decision).toBe("red");
    expect(result.validation.missingRequiredFieldKeys).toEqual(["accessionNumber"]);
    // 初始 1 次 + 重试 2 次 = 3 次（不会无限调用）
    expect(provider.extractFields).toHaveBeenCalledTimes(3);
  });
});
