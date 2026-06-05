export interface GenericJsonFieldValue {
  fieldKey: string;
  targetPath: string;
  value: unknown;
}

export interface AdapterErrorOptions {
  code: string;
  fieldKey?: string;
  targetPath?: string;
  cause?: unknown;
}

export class AdapterError extends Error {
  readonly code: string;
  readonly fieldKey?: string;
  readonly targetPath?: string;

  constructor(message: string, options: AdapterErrorOptions) {
    super(message);
    this.name = "AdapterError";
    this.code = options.code;

    if (options.fieldKey !== undefined) {
      this.fieldKey = options.fieldKey;
    }

    if (options.targetPath !== undefined) {
      this.targetPath = options.targetPath;
    }

    if ("cause" in options) {
      this.cause = options.cause;
    }
  }
}

function ensurePath(path: string, fieldKey: string): string[] {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  // 通用 JSON 适配器允许两类路径：
  // 1. 顶层字段，例如 patientName
  // 2. 嵌套字段，例如 clinicalInfo.sampleType
  // 因此这里仅拒绝空路径，不再强制要求至少两段。
  if (segments.length === 0) {
    throw new AdapterError(`字段 ${fieldKey} 的目标路径无效：${path}`, {
      code: "INVALID_TARGET_PATH",
      fieldKey,
      targetPath: path
    });
  }

  return segments;
}

function setNestedValue(
  target: Record<string, unknown>,
  targetPath: string,
  value: unknown,
  fieldKey: string
): void {
  const segments = ensurePath(targetPath, fieldKey);
  let current: Record<string, unknown> = target;

  // 先逐层定位到叶子节点的父对象。遇到不存在的层级时自动创建对象，
  // 遇到已存在但不是对象的值时立即报错，避免覆盖已有结构。
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      throw new AdapterError(`字段 ${fieldKey} 的目标路径无效：${targetPath}`, {
        code: "INVALID_TARGET_PATH",
        fieldKey,
        targetPath
      });
    }

    const existing = current[segment];
    if (existing === undefined) {
      const next: Record<string, unknown> = {};
      current[segment] = next;
      current = next;
      continue;
    }

    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      throw new AdapterError(`字段 ${fieldKey} 的目标路径与已有值冲突：${targetPath}`, {
        code: "TARGET_PATH_CONFLICT",
        fieldKey,
        targetPath
      });
    }

    current = existing as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment === undefined) {
    throw new AdapterError(`字段 ${fieldKey} 的目标路径无效：${targetPath}`, {
      code: "INVALID_TARGET_PATH",
      fieldKey,
      targetPath
    });
  }

  // 同一路径允许重复写入相同值，这样多处汇总时不会产生误报；
  // 但若同一路径被写入不同值，则说明字段映射本身冲突，需要显式失败。
  const existingLeaf = current[lastSegment];
  if (existingLeaf !== undefined && existingLeaf !== value) {
    throw new AdapterError(`字段 ${fieldKey} 的目标路径重复且值不一致：${targetPath}`, {
      code: "TARGET_PATH_CONFLICT",
      fieldKey,
      targetPath
    });
  }

  current[lastSegment] = value;
}

export function buildGenericJsonPayload(fields: GenericJsonFieldValue[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of fields) {
    setNestedValue(payload, field.targetPath, field.value, field.fieldKey);
  }

  return payload;
}
