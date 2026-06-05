import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import { AdapterError, buildGenericJsonPayload, type GenericJsonFieldValue } from "./genericJsonAdapter";

export interface LimsMappedField extends GenericJsonFieldValue {
  writebackMode: "preview" | "auto";
}

export interface BuildLimsClinicalPayloadInput {
  schema: CoreSchemaDraft;
  candidates: ModelFieldCandidate[];
  includeWritebackModes?: Array<"preview" | "auto">;
}

export interface LimsClinicalPayloadResult {
  payload: Record<string, unknown>;
  mappedFields: LimsMappedField[];
}

function getSchemaField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

export function buildLimsClinicalPayload(input: BuildLimsClinicalPayloadInput): LimsClinicalPayloadResult {
  const includeWritebackModes = input.includeWritebackModes ?? ["preview", "auto"];
  const mappedFields: LimsMappedField[] = [];

  for (const candidate of input.candidates) {
    if (candidate.value === null) {
      continue;
    }

    const field = getSchemaField(input.schema, candidate.fieldKey);
    if (!field) {
      throw new AdapterError(`字段 ${candidate.fieldKey} 不存在于当前 schema，无法生成 LIMS payload。`, {
        code: "UNKNOWN_FIELD",
        fieldKey: candidate.fieldKey
      });
    }

    const targetPath = field.adapterHints?.limsTargetPath;
    if (!targetPath) {
      throw new AdapterError(`字段 ${candidate.fieldKey} 缺少 LIMS target path，无法生成 payload。`, {
        code: "MISSING_TARGET_PATH",
        fieldKey: candidate.fieldKey
      });
    }

    const writebackMode = field.adapterHints?.writebackMode ?? "preview";
    if (!includeWritebackModes.includes(writebackMode)) {
      continue;
    }

    mappedFields.push({
      fieldKey: candidate.fieldKey,
      targetPath,
      value: candidate.value,
      writebackMode
    });
  }

  return {
    payload: buildGenericJsonPayload(mappedFields),
    mappedFields
  };
}
