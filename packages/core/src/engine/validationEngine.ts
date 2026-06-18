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

export interface ValidationAgentResult {
  decision: ValidationDecision;
  fieldResults: FieldValidationResult[];
}

export interface ValidationEngineInput {
  schema: CoreSchemaDraft;
  candidates: ModelFieldCandidate[];
}

export interface ValidationEngineResult extends ValidationAgentResult {
  requiredFieldKeys: string[];
  missingRequiredFieldKeys: string[];
  acceptedFieldKeys: string[];
  reviewFieldKeys: string[];
  normalizedCandidates: ModelFieldCandidate[];
}

function isRequiredFieldKey(field: CoreFieldDefinition): boolean {
  return Boolean(field.required || field.critical);
}

export function getRequiredFieldKeys(schema: CoreSchemaDraft): string[] {
  const schemaRequiredFieldKeys = schema.fields.filter(isRequiredFieldKey).map((field) => field.key);
  if (schemaRequiredFieldKeys.length > 0) {
    return schemaRequiredFieldKeys;
  }

  return schema.fields.map((field) => field.key);
}

function getField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

function normalizeEnumCandidate(schema: CoreSchemaDraft, candidate: ModelFieldCandidate): ModelFieldCandidate {
  const field = getField(schema, candidate.fieldKey);
  if (!field?.enumMap || typeof candidate.value !== "string") {
    return candidate;
  }

  if (Object.prototype.hasOwnProperty.call(field.enumMap, candidate.value)) {
    return candidate;
  }

  const matchedEntry = Object.entries(field.enumMap).find(([, label]) => label === candidate.value);
  if (!matchedEntry) {
    return candidate;
  }

  return {
    ...candidate,
    value: matchedEntry[0]
  };
}

function normalizeCandidates(schema: CoreSchemaDraft, candidates: ModelFieldCandidate[]): ModelFieldCandidate[] {
  return candidates.map((candidate) => normalizeEnumCandidate(schema, candidate));
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

function appendConflictWarnings(
  fieldResults: FieldValidationResult[],
  candidates: ModelFieldCandidate[]
): FieldValidationResult[] {
  const valuesByField = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const values = valuesByField.get(candidate.fieldKey) ?? new Set<string>();
    values.add(JSON.stringify(candidate.value));
    valuesByField.set(candidate.fieldKey, values);
  }

  return fieldResults.map((fieldResult) => {
    const values = valuesByField.get(fieldResult.fieldKey);
    if (!values || values.size <= 1) {
      return fieldResult;
    }

    return {
      ...fieldResult,
      decision: fieldResult.decision === "accepted" ? "needs_review" : fieldResult.decision,
      issues: [
        ...fieldResult.issues,
        {
          code: "CONFLICTING_CANDIDATES" as const,
          message: `字段 ${fieldResult.fieldKey} 存在多个互相冲突的候选值。`,
          severity: "warning" as const
        }
      ]
    };
  });
}

export function runValidationEngine(input: ValidationEngineInput): ValidationEngineResult {
  const normalizedCandidates = normalizeCandidates(input.schema, input.candidates);
  const fieldResults: FieldValidationResult[] = appendConflictWarnings(
    [
      ...normalizedCandidates.map((candidate) => createFieldValidationResult(input.schema, candidate)),
      ...getMissingRequiredFieldResults(input.schema, normalizedCandidates)
    ],
    normalizedCandidates
  );
  const requiredFieldKeys = getRequiredFieldKeys(input.schema);
  const seenFieldKeys = new Set(normalizedCandidates.map((candidate) => candidate.fieldKey));
  const missingRequiredFieldKeys = requiredFieldKeys.filter((fieldKey) => !seenFieldKeys.has(fieldKey));
  const acceptedFieldKeys = fieldResults
    .filter((field) => field.decision === "accepted")
    .map((field) => field.fieldKey);
  const reviewFieldKeys = fieldResults
    .filter((field) => field.decision === "needs_review")
    .map((field) => field.fieldKey);
  const rejectedFieldKeys = fieldResults
    .filter((field) => field.decision === "rejected")
    .map((field) => field.fieldKey);

  // 顶层决策语义：rejected（含必填缺失）→ blocked；仅 needs_review → needs_review；否则 green。
  // 原实现把 rejected 也合并进 needs_review，丢失了 blocked 语义，导致 autoDecision 无法区分
  // "可放行但需复核" 与 "存在阻断性错误"。
  const decision: ValidationDecision = rejectedFieldKeys.length > 0
    ? "blocked"
    : reviewFieldKeys.length > 0
      ? "needs_review"
      : "green";

  return {
    decision,
    fieldResults,
    requiredFieldKeys,
    missingRequiredFieldKeys,
    acceptedFieldKeys,
    reviewFieldKeys,
    normalizedCandidates
  };
}

function getMissingRequiredFieldResults(
  schema: CoreSchemaDraft,
  candidates: ModelFieldCandidate[]
): FieldValidationResult[] {
  const seenFieldKeys = new Set(candidates.map((candidate) => candidate.fieldKey));
  const requiredFieldKeys = getRequiredFieldKeys(schema);
  return requiredFieldKeys
    .filter((fieldKey) => !seenFieldKeys.has(fieldKey))
    .map((fieldKey) => ({
      fieldKey,
      decision: "rejected" as const,
      confidence: 0,
      evidenceCount: 0,
      issues: [
        {
          code: "MISSING_EVIDENCE" as const,
          message: `关键字段 ${fieldKey} 缺少候选结果。`,
          severity: "error" as const
        }
      ]
    }));
}
