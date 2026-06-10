export type CoreFieldType = "string" | "number" | "boolean" | "date" | "enum" | "list";

export interface CoreEvidencePolicy {
  required: boolean;
  minConfidence: number;
  requireSourceText: boolean;
  requirePageReference: boolean;
}

export interface CoreFieldAdapterHints {
  limsTargetPath?: string;
  normalizer?: string;
  writebackMode?: "preview" | "auto";
}

export interface CoreFieldDefinition {
  key: string;
  label: string;
  type: CoreFieldType;
  comments: string[];
  required?: boolean;
  critical?: boolean;
  adapterHints?: CoreFieldAdapterHints;
  enumMap?: Record<string, string>;
}

export interface CoreSchemaDraft {
  key: string;
  label: string;
  version: string;
  evidencePolicy: CoreEvidencePolicy;
  fields: CoreFieldDefinition[];
}

export interface SchemaValidationError {
  code:
    | "MISSING_SCHEMA_KEY"
    | "MISSING_SCHEMA_LABEL"
    | "MISSING_SCHEMA_VERSION"
    | "MISSING_EVIDENCE_POLICY"
    | "INVALID_MIN_CONFIDENCE"
    | "INVALID_FIELDS"
    | "MISSING_FIELD_KEY"
    | "DUPLICATE_FIELD_KEY"
    | "MISSING_FIELD_LABEL"
    | "INVALID_TARGET_PATH"
    | "UNSUPPORTED_FIELD_TYPE"
    | "MISSING_ENUM_MAP";
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

const supportedFieldTypes: readonly string[] = ["string", "number", "boolean", "date", "enum", "list"];

const limsTargetPathPattern = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;

export function validateCoreSchemaDraft(schema: CoreSchemaDraft): SchemaValidationResult {
  return validateCoreSchemaDraftInput(schema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyEnumMap(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some((enumLabel) => isNonEmptyString(enumLabel));
}

export function validateCoreSchemaDraftInput(input: unknown): SchemaValidationResult {
  const errors: SchemaValidationError[] = [];
  const seenKeys = new Set<string>();

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        {
          code: "INVALID_FIELDS",
          path: "schema",
          message: "Schema 草稿必须是 JSON 对象。请提交包含 key、label、version、evidencePolicy 和 fields 的对象。"
        }
      ]
    };
  }

  if (!isNonEmptyString(input.key)) {
    errors.push({
      code: "MISSING_SCHEMA_KEY",
      path: "key",
      message: "Schema 缺少 key。请填写稳定的英文标识，例如 lims-clinical-info。"
    });
  }

  if (!isNonEmptyString(input.label)) {
    errors.push({
      code: "MISSING_SCHEMA_LABEL",
      path: "label",
      message: "Schema 缺少 label。请填写人工可读的中文名称。"
    });
  }

  if (!isNonEmptyString(input.version)) {
    errors.push({
      code: "MISSING_SCHEMA_VERSION",
      path: "version",
      message: "Schema 缺少 version。请填写版本号，例如 1.0.0。"
    });
  }

  if (!isRecord(input.evidencePolicy)) {
    errors.push({
      code: "MISSING_EVIDENCE_POLICY",
      path: "evidencePolicy",
      message: "Schema 缺少 evidencePolicy。请补充证据策略和 minConfidence。"
    });
  } else {
    const minConfidence = input.evidencePolicy.minConfidence;
    if (typeof minConfidence !== "number" || minConfidence < 0 || minConfidence > 1) {
      errors.push({
        code: "INVALID_MIN_CONFIDENCE",
        path: "evidencePolicy.minConfidence",
        message: "evidencePolicy.minConfidence 必须是 0 到 1 之间的数字，请调整置信度阈值。"
      });
    }
  }

  if (!Array.isArray(input.fields)) {
    errors.push({
      code: "INVALID_FIELDS",
      path: "fields",
      message: "Schema fields 必须是字段定义数组。请提交 fields: [{ key, label, type, comments }]。"
    });

    return {
      valid: false,
      errors
    };
  }

  input.fields.forEach((fieldInput, index) => {
    if (!isRecord(fieldInput)) {
      errors.push({
        code: "INVALID_FIELDS",
        path: `fields[${index}]`,
        message: `fields[${index}] 必须是字段定义对象。请补充 key、label、type 和 comments。`
      });
      return;
    }

    const fieldKey = isNonEmptyString(fieldInput.key) ? fieldInput.key : `fields[${index}]`;
    const fieldType = typeof fieldInput.type === "string" ? fieldInput.type : "";

    if (!isNonEmptyString(fieldInput.key)) {
      errors.push({
        code: "MISSING_FIELD_KEY",
        path: `fields[${index}].key`,
        message: `fields[${index}] 缺少 key。请填写唯一字段标识。`
      });
    }

    // 字段 key 是在线 schema 编辑、抽取结果和 LIMS 适配的共同锚点，所以重复时必须指出第二个重复位置。
    if (isNonEmptyString(fieldInput.key) && seenKeys.has(fieldInput.key)) {
      errors.push({
        code: "DUPLICATE_FIELD_KEY",
        path: `fields[${index}].key`,
        message: `字段 key "${fieldInput.key}" 重复。请为该字段设置唯一 key，避免抽取结果互相覆盖。`
      });
    }
    if (isNonEmptyString(fieldInput.key)) {
      seenKeys.add(fieldInput.key);
    }

    // label 会展示给人工审核和 schema 编辑器，缺失时给出直接可执行的补充建议。
    if (!isNonEmptyString(fieldInput.label)) {
      errors.push({
        code: "MISSING_FIELD_LABEL",
        path: `fields[${index}].label`,
        message: `字段 "${fieldKey}" 缺少中文 label。请补充人工可读的字段名称。`
      });
    }

    if (!supportedFieldTypes.includes(fieldType)) {
      errors.push({
        code: "UNSUPPORTED_FIELD_TYPE",
        path: `fields[${index}].type`,
        message: `字段 "${fieldKey}" 使用了不支持的类型 "${fieldType || "空类型"}"。请改为 string、number、boolean、date、enum 或 list。`
      });
    }

    const adapterHints = isRecord(fieldInput.adapterHints) ? fieldInput.adapterHints : undefined;
    const targetPath = adapterHints?.limsTargetPath;
    // LIMS 写回路径只接受多段点路径，例如 clinicalInfo.smokingHistory，避免空段或特殊字符进入写回适配器。
    if (typeof targetPath === "string" && !limsTargetPathPattern.test(targetPath)) {
      errors.push({
        code: "INVALID_TARGET_PATH",
        path: `fields[${index}].adapterHints.limsTargetPath`,
        message: `字段 "${fieldKey}" 的 LIMS 目标路径 "${targetPath}" 无效。请使用 clinicalInfo.fieldName 这类点分路径。`
      });
    }

    if (fieldType === "enum" && !isNonEmptyEnumMap(fieldInput.enumMap)) {
      errors.push({
        code: "MISSING_ENUM_MAP",
        path: `fields[${index}].enumMap`,
        message: `枚举字段 "${fieldKey}" 缺少非空 enumMap。请补充枚举值到中文含义的映射。`
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
