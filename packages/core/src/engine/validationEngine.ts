import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import {
  createValidationAgent,
  type FieldValidationResult,
  type ValidationAgentResult
} from "../agents/validationAgent";

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

  return schema.fields.some((field) => field.key === "clinicalDiagnosis") ? ["clinicalDiagnosis"] : [];
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
  const validation = createValidationAgent().run({
    schema: input.schema,
    candidates: normalizedCandidates
  });
  const seenFieldKeys = new Set(normalizedCandidates.map((candidate) => candidate.fieldKey));
  const requiredFieldKeys = getRequiredFieldKeys(input.schema);
  const missingRequiredFieldKeys = requiredFieldKeys.filter((fieldKey) => !seenFieldKeys.has(fieldKey));
  const fieldResults: FieldValidationResult[] = appendConflictWarnings([
    ...validation.fieldResults,
    ...missingRequiredFieldKeys.map((fieldKey) => ({
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
    }))
  ], normalizedCandidates);
  const acceptedFieldKeys = fieldResults
    .filter((field) => field.decision === "accepted")
    .map((field) => field.fieldKey);
  const reviewFieldKeys = fieldResults
    .filter((field) => field.decision !== "accepted")
    .map((field) => field.fieldKey);

  return {
    decision: reviewFieldKeys.length > 0 ? "needs_review" : "green",
    fieldResults,
    requiredFieldKeys,
    missingRequiredFieldKeys,
    acceptedFieldKeys,
    reviewFieldKeys,
    normalizedCandidates
  };
}
