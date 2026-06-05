import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";

export type ValidationDecision = "green" | "needs_review" | "blocked";
export type FieldValidationDecision = "accepted" | "needs_review" | "rejected";
export type ValidationIssueSeverity = "warning" | "error";

export interface ValidationIssue {
  code:
    | "UNKNOWN_FIELD"
    | "LOW_CONFIDENCE"
    | "MISSING_EVIDENCE"
    | "MISSING_PAGE_REFERENCE"
    | "TYPE_MISMATCH"
    | "ENUM_MISMATCH"
    | "CONFLICTING_CANDIDATES";
  message: string;
  severity: ValidationIssueSeverity;
}

export interface FieldValidationResult {
  fieldKey: string;
  decision: FieldValidationDecision;
  confidence: number;
  evidenceCount: number;
  issues: ValidationIssue[];
}

export interface ValidationAgentInput {
  schema: CoreSchemaDraft;
  candidates: ModelFieldCandidate[];
}

export interface ValidationAgentResult {
  decision: ValidationDecision;
  fieldResults: FieldValidationResult[];
}

export interface ValidationAgent {
  allowedTools: readonly ["schema.validateCandidates"];
  run(input: ValidationAgentInput): ValidationAgentResult;
}

function getField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

function matchesFieldType(candidate: ModelFieldCandidate, field: CoreFieldDefinition): boolean {
  const value = candidate.value;
  if (value === null) {
    return true;
  }

  if (field.type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (field.type === "boolean") {
    return typeof value === "boolean";
  }
  if (field.type === "list") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (field.type === "enum") {
    return typeof value === "string";
  }

  return typeof value === "string";
}

function hasEnumValue(candidate: ModelFieldCandidate, field: CoreFieldDefinition): boolean {
  if (candidate.value === null || field.type !== "enum" || !field.enumMap) {
    return true;
  }

  return typeof candidate.value === "string" && Object.prototype.hasOwnProperty.call(field.enumMap, candidate.value);
}

function createFieldValidationResult(schema: CoreSchemaDraft, candidate: ModelFieldCandidate): FieldValidationResult {
  const field = getField(schema, candidate.fieldKey);
  const issues: ValidationIssue[] = [];

  if (!field) {
    issues.push({
      code: "UNKNOWN_FIELD",
      message: `字段 ${candidate.fieldKey} 不在当前 schema 中。`,
      severity: "error"
    });
  } else {
    if (!matchesFieldType(candidate, field)) {
      issues.push({
        code: "TYPE_MISMATCH",
        message: `字段 ${candidate.fieldKey} 的值类型与 schema 定义不一致。`,
        severity: "error"
      });
    }
    if (!hasEnumValue(candidate, field)) {
      issues.push({
        code: "ENUM_MISMATCH",
        message: `字段 ${candidate.fieldKey} 的枚举值不在 schema.enumMap 中。`,
        severity: "error"
      });
    }
  }

  if (candidate.confidence < schema.evidencePolicy.minConfidence) {
    issues.push({
      code: "LOW_CONFIDENCE",
      message: `字段 ${candidate.fieldKey} 置信度低于 ${schema.evidencePolicy.minConfidence}。`,
      severity: "warning"
    });
  }

  if (schema.evidencePolicy.required && candidate.evidence.length === 0) {
    issues.push({
      code: "MISSING_EVIDENCE",
      message: `字段 ${candidate.fieldKey} 缺少证据片段。`,
      severity: "error"
    });
  }

  if (schema.evidencePolicy.requirePageReference && candidate.evidence.some((evidence) => evidence.pageNumber === undefined)) {
    issues.push({
      code: "MISSING_PAGE_REFERENCE",
      message: `字段 ${candidate.fieldKey} 的证据缺少页码引用。`,
      severity: "warning"
    });
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const decision: FieldValidationDecision = hasError ? "rejected" : issues.length > 0 ? "needs_review" : "accepted";

  return {
    fieldKey: candidate.fieldKey,
    decision,
    confidence: candidate.confidence,
    evidenceCount: candidate.evidence.length,
    issues
  };
}

export function createValidationAgent(): ValidationAgent {
  return {
    allowedTools: ["schema.validateCandidates"],
    run(input) {
      const fieldResults = input.candidates.map((candidate) => createFieldValidationResult(input.schema, candidate));
      const hasRejected = fieldResults.some((field) => field.decision === "rejected");
      const hasReview = fieldResults.some((field) => field.decision === "needs_review");

      return {
        decision: hasRejected || hasReview ? "needs_review" : "green",
        fieldResults
      };
    }
  };
}
