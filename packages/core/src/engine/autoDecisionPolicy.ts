import type { WritebackNodeResult } from "../nodes/writebackNode";
import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { ValidationEngineResult } from "./validationEngine";

export type AutoDecision = "green" | "yellow" | "red";

export interface AutoDecisionReason {
  code:
    | "AUTO_WRITEBACK_DISABLED"
    | "KEY_FIELD_NOT_ACCEPTED"
    | "OPTIONAL_FIELD_NEEDS_REVIEW"
    | "WRITEBACK_READY"
    | "WRITEBACK_NOT_READY"
    | "SCHEMA_INACTIVE"
    | "MISSING_PERMISSION";
  message: string;
  fieldKey?: string;
}

export interface AutoDecisionPolicyInput {
  validation: ValidationEngineResult;
  candidates: ModelFieldCandidate[];
  writeback: WritebackNodeResult;
  autoWritebackEnabled: boolean;
  schemaActive: boolean;
  hasWritebackPermission: boolean;
}

export interface AutoDecisionPolicyResult {
  decision: AutoDecision;
  shouldWriteback: boolean;
  reasons: AutoDecisionReason[];
}

export function evaluateAutoDecision(input: AutoDecisionPolicyInput): AutoDecisionPolicyResult {
  const reasons: AutoDecisionReason[] = [];
  const keyFieldKeys = new Set(input.validation.requiredFieldKeys);

  if (!input.schemaActive) {
    reasons.push({
      code: "SCHEMA_INACTIVE",
      message: "当前 schema 未发布或已停用。"
    });
  }

  const keyIssues = input.validation.fieldResults.filter(
    (field) => keyFieldKeys.has(field.fieldKey) && field.decision !== "accepted"
  );
  for (const field of keyIssues) {
    reasons.push({
      code: "KEY_FIELD_NOT_ACCEPTED",
      message: `关键字段 ${field.fieldKey} 未达到自动通过条件。`,
      fieldKey: field.fieldKey
    });
  }

  const optionalIssues = input.validation.fieldResults.filter(
    (field) => !keyFieldKeys.has(field.fieldKey) && field.decision !== "accepted"
  );
  for (const field of optionalIssues) {
    reasons.push({
      code: "OPTIONAL_FIELD_NEEDS_REVIEW",
      message: `非关键字段 ${field.fieldKey} 需要复核。`,
      fieldKey: field.fieldKey
    });
  }

  if (!input.hasWritebackPermission) {
    reasons.push({
      code: "MISSING_PERMISSION",
      message: "当前执行上下文缺少写回权限。"
    });
  }

  if (!input.autoWritebackEnabled) {
    reasons.push({
      code: "AUTO_WRITEBACK_DISABLED",
      message: "自动写回开关未启用。"
    });
  } else if (input.writeback.ready) {
    reasons.push({
      code: "WRITEBACK_READY",
      message: "自动写回条件已满足。"
    });
  } else if (input.writeback.blockers.length > 0) {
    reasons.push({
      code: "WRITEBACK_NOT_READY",
      message: "写回准备检查未通过。"
    });
  }

  if (!input.schemaActive || keyIssues.length > 0) {
    return {
      decision: "red",
      shouldWriteback: false,
      reasons
    };
  }

  if (optionalIssues.length > 0) {
    return {
      decision: "yellow",
      shouldWriteback: false,
      reasons
    };
  }

  return {
    decision: "green",
    shouldWriteback: input.autoWritebackEnabled && input.writeback.ready && input.hasWritebackPermission,
    reasons
  };
}
