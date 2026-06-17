import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type { ValidationAgentResult } from "./validationAgent";
import type {
  RuleCandidateProposal,
  RuleCandidateEvidence,
  CorrectionProposal,
  RuleProposal
} from "@medical-record-agent/shared";
import type { EvaluationSampleResult } from "../evaluation/evaluationRunner";
import { createHash } from "node:crypto";

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

/** 候选生成中间结构 */
export interface CandidateDraft {
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: RuleCandidateEvidence[];
  proposalHash: string;
}

function computeProposalHash(proposal: RuleCandidateProposal): string {
  let content: string;
  if (proposal.type === "correction") {
    content = `${proposal.fieldKey}|${proposal.originalValue}|${proposal.correctedValue}`;
  } else {
    content = `${proposal.fieldKey}|${proposal.condition}|${proposal.expectedValue}`;
  }
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * 从评测运行的错误样本中提炼知识候选。
 * - 单条错误 -> 纠偏记录候选 (correction)
 * - 同字段 >=2 条错误 -> 额外聚合生成结构化规则候选 (rule)
 */
export function generateCandidates(
  sampleResults: EvaluationSampleResult[],
  schemaKey: string
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];

  // 按字段收集错误
  const errorsByField = new Map<string, Array<{
    sampleId: string;
    runId: string;
    originalValue: string;
    correctedValue: string;
  }>>();

  for (const result of sampleResults) {
    if (result.status !== "completed") continue;
    for (const field of result.fieldResults) {
      if (!field.fieldKey) continue;
      const truth = field.normalizedGroundTruthValue ?? field.groundTruthValue;
      const pred = field.normalizedPredictedValue ?? field.predictedValue;
      if (truth == null || pred == null) continue;
      if (String(truth) === String(pred)) continue;

      if (!errorsByField.has(field.fieldKey)) {
        errorsByField.set(field.fieldKey, []);
      }
      errorsByField.get(field.fieldKey)!.push({
        sampleId: result.sampleId,
        runId: "",
        originalValue: String(pred),
        correctedValue: String(truth)
      });
    }
  }

  // 生成纠偏候选
  for (const [fieldKey, errors] of errorsByField) {
    for (const err of errors) {
      const proposal: CorrectionProposal = {
        type: "correction",
        fieldKey,
        originalValue: err.originalValue,
        correctedValue: err.correctedValue
      };
      const evidence: RuleCandidateEvidence[] = [
        { runId: err.runId, sampleId: err.sampleId, fieldKey }
      ];
      drafts.push({
        schemaKey,
        fieldKey,
        ruleType: "correction",
        proposal,
        evidence,
        proposalHash: computeProposalHash(proposal)
      });
    }

    // 同字段 >=2 条错误时生成规则候选
    if (errors.length >= 2) {
      const correctedValues = [...new Set(errors.map(e => e.correctedValue))];
      if (correctedValues.length === 1) {
        const expectedValue = correctedValues[0];
        const originalValues = errors.map(e => e.originalValue);
        const condition = `当识别结果为 ${originalValues.join(" 或 ")} 时，应为 ${expectedValue}`;
        const proposal: RuleProposal = {
          type: "rule",
          fieldKey,
          condition,
          expectedValue,
          evidenceCount: errors.length
        };
        const evidence: RuleCandidateEvidence[] = errors.map(e => ({
          runId: e.runId,
          sampleId: e.sampleId,
          fieldKey
        }));
        drafts.push({
          schemaKey,
          fieldKey,
          ruleType: "rule",
          proposal,
          evidence,
          proposalHash: computeProposalHash(proposal)
        });
      }
    }
  }

  return drafts;
}
