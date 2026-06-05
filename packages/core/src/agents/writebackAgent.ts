import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import type { ValidationDecision } from "./validationAgent";

export interface WritebackReadyField {
  fieldKey: string;
  targetPath: string;
  value: ModelFieldCandidate["value"];
}

export interface WritebackBlocker {
  code: "NOT_GREEN_DECISION" | "MISSING_PERMISSION" | "NO_AUTO_FIELDS" | "MISSING_TARGET_PATH";
  message: string;
  fieldKey?: string;
}

export interface WritebackAgentInput {
  schema: CoreSchemaDraft;
  validationDecision: ValidationDecision;
  permissions: string[];
  candidates: ModelFieldCandidate[];
}

export interface WritebackAgentResult {
  ready: boolean;
  readyFields: WritebackReadyField[];
  blockers: WritebackBlocker[];
}

export interface WritebackAgent {
  allowedTools: readonly ["writeback.checkReadiness"];
  run(input: WritebackAgentInput): WritebackAgentResult;
}

function findField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

export function createWritebackAgent(): WritebackAgent {
  return {
    allowedTools: ["writeback.checkReadiness"],
    run(input) {
      const blockers: WritebackBlocker[] = [];

      if (input.validationDecision !== "green") {
        blockers.push({
          code: "NOT_GREEN_DECISION",
          message: "只有 green 决策才允许进入自动写回准备阶段。"
        });
      }

      if (!input.permissions.includes("lims.writeback")) {
        blockers.push({
          code: "MISSING_PERMISSION",
          message: "缺少 lims.writeback 权限。"
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
