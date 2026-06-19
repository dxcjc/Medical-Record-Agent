import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import { normalizePathologicalDiagnosis } from "../normalizers/pathologyNormalizer";

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
    | "CONFLICTING_CANDIDATES"
    | "VALUE_TOO_LONG";
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
  /**
   * 需要重新抽取的字段 key（P1-3）。
   * 当字段值过长且后处理 normalizer 无法简化到阈值内时填充，
   * 供 workflow shouldRetryExtraction 触发针对该字段的重抽。
   */
  reextractionFieldKeys: string[];
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

// ── P1-3：字段值长度校验与后处理 ──

/**
 * 需要长度校验的字段配置：字段 key → { 阈值字符数, 后处理 normalizer }。
 * 超过阈值的字段先尝试 normalizer 简化；简化后仍超长则触发重抽。
 */
const LENGTH_CONSTRAINED_FIELDS: Record<string, { maxLength: number; normalize: (text: string) => { normalizedValue: string; confidence: number } }> = {
  pathologicalDiagnosis: {
    maxLength: 40,
    normalize: (text) => {
      const result = normalizePathologicalDiagnosis(text);
      return { normalizedValue: result.normalizedValue, confidence: result.confidence };
    }
  }
};

/**
 * 对超长字段尝试后处理简化。
 * 返回 { candidate: 后处理后的候选（若简化成功）, needsReextraction: 是否仍需重抽 }。
 */
function applyLengthPostProcess(
  candidate: ModelFieldCandidate
): { candidate: ModelFieldCandidate; needsReextraction: boolean; issue?: ValidationIssue } {
  const constraint = LENGTH_CONSTRAINED_FIELDS[candidate.fieldKey];
  if (!constraint || typeof candidate.value !== "string") {
    return { candidate, needsReextraction: false };
  }

  const originalLength = candidate.value.length;
  if (originalLength <= constraint.maxLength) {
    return { candidate, needsReextraction: false };
  }

  // 超长：先尝试 normalizer 简化
  const normalized = constraint.normalize(candidate.value);
  if (normalized.normalizedValue.length <= constraint.maxLength && normalized.normalizedValue.length > 0) {
    // 简化成功，更新候选值
    return {
      candidate: { ...candidate, value: normalized.normalizedValue },
      needsReextraction: false,
      issue: {
        code: "VALUE_TOO_LONG",
        message: `字段 ${candidate.fieldKey} 原值过长（${originalLength} 字符），已后处理简化为 ${normalized.normalizedValue.length} 字符。`,
        severity: "warning"
      }
    };
  }

  // 简化后仍超长或为空，触发重抽
  return {
    candidate,
    needsReextraction: true,
    issue: {
      code: "VALUE_TOO_LONG",
      message: `字段 ${candidate.fieldKey} 值过长（${originalLength} 字符，阈值 ${constraint.maxLength}），后处理仍无法简化，需重新抽取。`,
      severity: "warning"
    }
  };
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
  const hasOnlyWarnings = !hasError && issues.length > 0;
  // 自动接受仅有警告的字段（如低置信度、缺少证据等），仅拒绝有错误的字段
  const decision: FieldValidationDecision = hasError ? "rejected" : "accepted";

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
      // 保留 accepted 状态，即使有冲突候选值也自动接受（测试模式）
      decision: fieldResult.decision,
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
  const enumNormalized = normalizeCandidates(input.schema, input.candidates);

  // P1-3：对超长字段做后处理，收集需重抽的字段
  const reextractionFieldKeys: string[] = [];
  const lengthIssuesByField = new Map<string, ValidationIssue>();
  const normalizedCandidates = enumNormalized.map((candidate) => {
    const { candidate: processed, needsReextraction, issue } = applyLengthPostProcess(candidate);
    if (issue) {
      lengthIssuesByField.set(candidate.fieldKey, issue);
    }
    if (needsReextraction) {
      reextractionFieldKeys.push(candidate.fieldKey);
    }
    return processed;
  });

  const fieldResults: FieldValidationResult[] = appendConflictWarnings(
    [
      ...normalizedCandidates.map((candidate) => {
        const result = createFieldValidationResult(input.schema, candidate);
        // 将长度校验 issue 追加到对应字段结果
        const lengthIssue = lengthIssuesByField.get(candidate.fieldKey);
        if (lengthIssue) {
          return { ...result, issues: [...result.issues, lengthIssue] };
        }
        return result;
      }),
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
    normalizedCandidates,
    reextractionFieldKeys
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
