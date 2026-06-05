import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type { ValidationAgentResult } from "./validationAgent";

export interface EvaluationSampleCandidate {
  documentId: string;
  schemaKey: string;
  schemaVersion: string;
  deidentified: boolean;
  groundTruth: Array<{
    fieldKey: string;
    value: ModelFieldCandidate["value"];
  }>;
}

export interface EvaluationAgentInput {
  documentId: string;
  schema: CoreSchemaDraft;
  validation: ValidationAgentResult;
  candidates: ModelFieldCandidate[];
  markDeidentified: boolean;
}

export interface EvaluationAgentResult {
  sampleCandidate: EvaluationSampleCandidate;
  excludedFieldKeys: string[];
}

export interface EvaluationAgent {
  allowedTools: readonly ["evaluation.createSampleCandidate"];
  run(input: EvaluationAgentInput): EvaluationAgentResult;
}

export function createEvaluationAgent(): EvaluationAgent {
  return {
    allowedTools: ["evaluation.createSampleCandidate"],
    run(input) {
      const acceptedFieldKeys = new Set(
        input.validation.fieldResults
          .filter((field) => field.decision === "accepted")
          .map((field) => field.fieldKey)
      );
      const acceptedCandidates = input.candidates.filter((candidate) => acceptedFieldKeys.has(candidate.fieldKey));
      const excludedFieldKeys = input.candidates
        .filter((candidate) => !acceptedFieldKeys.has(candidate.fieldKey))
        .map((candidate) => candidate.fieldKey);

      // Evaluation Agent 只生成候选样本，不自动发布评估集。
      // 真实样本必须由调用方确认脱敏状态，避免把含身份信息的原始病历直接进入评估资产。
      return {
        sampleCandidate: {
          documentId: input.documentId,
          schemaKey: input.schema.key,
          schemaVersion: input.schema.version,
          deidentified: input.markDeidentified,
          groundTruth: acceptedCandidates.map((candidate) => ({
            fieldKey: candidate.fieldKey,
            value: candidate.value
          }))
        },
        excludedFieldKeys
      };
    }
  };
}
