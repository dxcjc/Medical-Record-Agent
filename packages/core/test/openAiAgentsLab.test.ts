import { describe, expect, it, vi } from "vitest";

import { createOpenAiAgentsComparisonLab, limsClinicalInfoSchema } from "../src/index";

describe("OpenAI Agents SDK comparison lab", () => {
  it("runs extraction and validation specialists through an injected runner without touching production workflow", async () => {
    const runner = vi.fn(async (agentName: string, input: string) => {
      if (agentName === "clinical-extraction-specialist") {
        return {
          finalOutput: JSON.stringify({
            candidates: [
              {
                fieldKey: "clinicalDiagnosis",
                value: "DEMO_DIAGNOSIS_A",
                confidence: 0.93,
                evidence: ["诊断：DEMO_DIAGNOSIS_A"]
              }
            ]
          }),
          trace: ["tool:schema_fields", "tool:evidence_policy"]
        };
      }

      return {
        finalOutput: JSON.stringify({
          decision: "green",
          reviewRequired: false,
          issues: []
        }),
        trace: ["tool:validate_evidence"]
      };
    });

    const lab = createOpenAiAgentsComparisonLab({ runner });
    const result = await lab.run({
      schema: limsClinicalInfoSchema,
      ocrText: "DEMO_CASE：诊断：DEMO_DIAGNOSIS_A。",
      targetFieldKeys: ["clinicalDiagnosis"]
    });

    expect(lab.kind).toBe("experiment");
    expect(lab.mainlineRecommendation).toBe("keep-langgraph-mainline");
    expect(runner).toHaveBeenCalledWith(
      "clinical-extraction-specialist",
      expect.stringContaining("clinicalDiagnosis")
    );
    const extractionPrompt = JSON.parse(runner.mock.calls[0]?.[1] ?? "{}");
    expect(extractionPrompt.fields).toEqual([
      expect.objectContaining({
        key: "clinicalDiagnosis",
        adapterHints: expect.objectContaining({
          limsTargetPath: "clinicalInfo.clinicalDiagnosis"
        })
      })
    ]);
    expect(runner).toHaveBeenCalledWith(
      "clinical-validation-specialist",
      expect.stringContaining("DEMO_DIAGNOSIS_A")
    );
    expect(result.finalDecision).toBe("green");
    expect(result.candidates).toEqual([
      expect.objectContaining({
        fieldKey: "clinicalDiagnosis",
        value: "DEMO_DIAGNOSIS_A",
        confidence: 0.93
      })
    ]);
    expect(result.trace).toEqual([
      expect.objectContaining({ agentName: "clinical-extraction-specialist" }),
      expect.objectContaining({ agentName: "clinical-validation-specialist" })
    ]);
  });
});
