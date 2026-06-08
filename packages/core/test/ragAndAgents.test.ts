import { describe, expect, it, vi } from "vitest";

import {
  createDefaultMedicalKnowledgeBase,
  createEvaluationAgent,
  createExtractionAgent,
  createInMemoryKnowledgeRetriever,
  createValidationAgent,
  createWritebackAgent,
  limsClinicalInfoSchema,
  type CoreSchemaDraft,
  type ModelProvider
} from "../src/index";

const demoOcrText = "DEMO_CASE_002：诊断：DEMO_DIAGNOSIS_A；病理提示肺腺癌；样本类型：组织。";

describe("light RAG and specialist agents", () => {
  it("retrieves field-scoped medical knowledge without exposing unrelated dictionary entries", async () => {
    const retriever = createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase());

    const result = await retriever.retrieve({
      query: "病理提示肺腺癌，抽取 tumorType。",
      fieldKeys: ["tumorType"],
      limit: 3
    });

    expect(result.entries.map((entry) => entry.id)).toContain("cancer-alias-lung-adenocarcinoma");
    expect(result.context.join("\n")).toContain("肺腺癌");
    expect(result.context.join("\n")).not.toContain("样本类型 LIMS 字典");
    expect(result.context.length).toBeLessThanOrEqual(3);
  });

  it("extraction agent calls model provider with RAG context and fixed tool permissions", async () => {
    const retriever = createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase());
    const provider: ModelProvider = {
      providerName: "agent-model-test",
      extractFields: vi.fn(async (request) => ({
        providerName: "agent-model-test",
        candidates: [
          {
            fieldKey: "tumorType",
            value: "肺腺癌",
            rawValue: "病理提示肺腺癌",
            confidence: 0.91,
            evidence: [{ snippet: "病理提示肺腺癌", startOffset: 30, endOffset: 37, pageNumber: 1 }]
          }
        ],
        raw: { contextCount: request.ragContext?.length ?? 0 }
      }))
    };
    const agent = createExtractionAgent({ provider, retriever });

    const result = await agent.run({
      schema: limsClinicalInfoSchema,
      ocrText: demoOcrText,
      targetFieldKeys: ["tumorType"]
    });

    expect(agent.allowedTools).toEqual(["knowledge.retrieve", "model.extractFields"]);
    expect(provider.extractFields).toHaveBeenCalledTimes(1);
    const request = vi.mocked(provider.extractFields).mock.calls[0]?.[0];
    expect(request?.ragContext?.join("\n")).toContain("肺腺癌");
    expect(request?.ragContext?.join("\n")).not.toContain("样本类型 LIMS 字典");
    expect(result.candidates[0]?.fieldKey).toBe("tumorType");
    expect(result.trace.ragEntryIds).toContain("cancer-alias-lung-adenocarcinoma");
  });

  it("validation agent returns evidence-backed risk decisions for missing evidence and confidence", () => {
    const validationAgent = createValidationAgent();

    const result = validationAgent.run({
      schema: limsClinicalInfoSchema,
      candidates: [
        {
          fieldKey: "clinicalDiagnosis",
          value: "DEMO_DIAGNOSIS_A",
          rawValue: "诊断：DEMO_DIAGNOSIS_A",
          confidence: 0.92,
          evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 10, endOffset: 31, pageNumber: 1 }]
        },
        {
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.52,
          evidence: []
        }
      ]
    });

    expect(validationAgent.allowedTools).toEqual(["schema.validateCandidates"]);
    expect(result.decision).toBe("needs_review");
    expect(result.fieldResults.find((field) => field.fieldKey === "clinicalDiagnosis")?.decision).toBe("accepted");
    expect(result.fieldResults.find((field) => field.fieldKey === "sampleType")?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LOW_CONFIDENCE" }),
        expect.objectContaining({ code: "MISSING_EVIDENCE" })
      ])
    );
  });

  it("writeback agent allows auto writeback only for configured auto fields with green decisions and permission", () => {
    const schema: CoreSchemaDraft = {
      ...limsClinicalInfoSchema,
      fields: limsClinicalInfoSchema.fields.map((field) =>
        field.key === "sampleType"
          ? { ...field, adapterHints: { ...field.adapterHints, writebackMode: "auto" as const } }
          : field
      )
    };
    const writebackAgent = createWritebackAgent();

    const ready = writebackAgent.run({
      schema,
      validationDecision: "green",
      permissions: ["writeback:execute"],
      candidates: [
        {
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.94,
          evidence: [{ snippet: "样本类型：组织", startOffset: 36, endOffset: 42, pageNumber: 1 }]
        }
      ]
    });
    const blocked = writebackAgent.run({
      schema,
      validationDecision: "green",
      permissions: [],
      candidates: ready.readyFields
    });

    expect(writebackAgent.allowedTools).toEqual(["writeback.checkReadiness"]);
    expect(ready.ready).toBe(true);
    expect(ready.readyFields).toEqual([
      expect.objectContaining({
        fieldKey: "sampleType",
        targetPath: "clinicalInfo.sampleType",
        value: "tissue"
      })
    ]);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toContainEqual(expect.objectContaining({ code: "MISSING_PERMISSION" }));
  });

  it("evaluation agent creates de-identified evaluation sample candidates from accepted fields only", () => {
    const evaluationAgent = createEvaluationAgent();

    const result = evaluationAgent.run({
      documentId: "demo-document-002",
      schema: limsClinicalInfoSchema,
      validation: {
        decision: "green",
        fieldResults: [
          {
            fieldKey: "clinicalDiagnosis",
            decision: "accepted",
            confidence: 0.94,
            evidenceCount: 1,
            issues: []
          },
          {
            fieldKey: "sampleType",
            decision: "needs_review",
            confidence: 0.52,
            evidenceCount: 0,
            issues: [{ code: "MISSING_EVIDENCE", message: "缺少证据片段", severity: "error" }]
          }
        ]
      },
      candidates: [
        {
          fieldKey: "clinicalDiagnosis",
          value: "DEMO_DIAGNOSIS_A",
          rawValue: "诊断：DEMO_DIAGNOSIS_A",
          confidence: 0.94,
          evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 10, endOffset: 31, pageNumber: 1 }]
        },
        {
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "组织",
          confidence: 0.52,
          evidence: []
        }
      ],
      markDeidentified: true
    });

    expect(evaluationAgent.allowedTools).toEqual(["evaluation.createSampleCandidate"]);
    expect(result.sampleCandidate).toEqual({
      documentId: "demo-document-002",
      schemaKey: "lims-clinical-info",
      schemaVersion: "1.0.0",
      deidentified: true,
      groundTruth: [{ fieldKey: "clinicalDiagnosis", value: "DEMO_DIAGNOSIS_A" }]
    });
    expect(result.excludedFieldKeys).toEqual(["sampleType"]);
  });
});
