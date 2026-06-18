import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import type { ValidationDecision } from "../engine/validationEngine";

export interface WritebackReadyField {
  fieldKey: string;
  targetPath: string;
  value: ModelFieldCandidate["value"];
}

export interface WritebackBlocker {
  code:
    | "NOT_GREEN_DECISION"
    | "MISSING_PERMISSION"
    | "NO_AUTO_FIELDS"
    | "MISSING_TARGET_PATH"
    | "EMPTY_AUTO_WRITEBACK_VALUE";
  message: string;
  fieldKey?: string;
}

export interface WritebackNodeInput {
  schema: CoreSchemaDraft;
  validationDecision: ValidationDecision;
  permissions: string[];
  candidates: ModelFieldCandidate[];
}

export interface WritebackNodeResult {
  ready: boolean;
  readyFields: WritebackReadyField[];
  blockers: WritebackBlocker[];
}

export interface WritebackNode {
  run(input: WritebackNodeInput): WritebackNodeResult;
}

function findField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

function hasWritebackValue(value: ModelFieldCandidate["value"]): boolean {
  if (value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return true;
}

export function createWritebackNode(): WritebackNode {
  return {
    run(input) {
      const blockers: WritebackBlocker[] = [];

      if (input.validationDecision !== "green") {
        blockers.push({
          code: "NOT_GREEN_DECISION",
          message: "只有 green 决策才允许进入自动写回准备阶段。"
        });
      }

      if (!input.permissions.includes("writeback:execute")) {
        blockers.push({
          code: "MISSING_PERMISSION",
          message: "缺少 writeback:execute 权限。"
        });
      }

      const readyFields: WritebackReadyField[] = [];
      for (const candidate of input.candidates) {
        const field = findField(input.schema, candidate.fieldKey);
        if (!field || field.adapterHints?.writebackMode !== "auto") {
          continue;
        }

        const targetPath = field.adapterHints.limsTargetPath;
        if (!targetPath) {
          blockers.push({
            code: "MISSING_TARGET_PATH",
            message: `字段 ${candidate.fieldKey} 缺少写回目标路径。`,
            fieldKey: candidate.fieldKey
          });
          continue;
        }

        // 自动写回是高风险动作，不能把空字符串、null 或空数组当作“高置信结果”写入下游系统。
        // 这里保留 0 和 false，因为它们是临床字段里可能出现的明确结构化值。
        if (!hasWritebackValue(candidate.value)) {
          blockers.push({
            code: "EMPTY_AUTO_WRITEBACK_VALUE",
            message: `字段 ${candidate.fieldKey} 的自动写回值为空。`,
            fieldKey: candidate.fieldKey
          });
          continue;
        }

        readyFields.push({
          fieldKey: candidate.fieldKey,
          targetPath,
          value: candidate.value
        });
      }

      if (readyFields.length === 0) {
        blockers.push({
          code: "NO_AUTO_FIELDS",
          message: "当前候选结果中没有可自动写回字段。"
        });
      }

      return {
        ready: blockers.length === 0,
        readyFields,
        blockers
      };
    }
  };
}
