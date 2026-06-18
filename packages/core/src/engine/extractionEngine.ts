import type { CoreFieldDefinition, CoreSchemaDraft } from "../schemas/schemaValidator";
import type {
  ModelExtractionRequest,
  ModelExtractionResult,
  ModelFieldCandidate,
  ModelProvider
} from "../providers/providerTypes";

export interface BuildExtractionPromptInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  ragContext?: string[];
  evidenceRequirements?: string[];
  imageBase64?: string;
  focusedFieldKeys?: string[];
}

export interface ExtractStructuredFieldsInput {
  provider: ModelProvider;
  schema: CoreSchemaDraft;
  ocrText: string;
  ragContext?: string[];
  evidenceRequirements?: string[];
  imageBase64?: string;
  focusedFieldKeys?: string[];
}

export interface ExtractStructuredFieldsResult extends ModelExtractionResult {
  prompt: string;
}

export const extractionOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldKey", "value", "rawValue", "confidence", "evidence"],
        properties: {
          fieldKey: { type: "string" },
          value: {
            oneOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "null" }
            ]
          },
          rawValue: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["snippet", "startOffset", "endOffset"],
              properties: {
                snippet: { type: "string" },
                startOffset: { type: "number", minimum: 0 },
                endOffset: { type: "number", minimum: 0 },
                pageNumber: { type: "number" },
                blockId: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
} as const;

function formatField(field: CoreFieldDefinition): string {
  const enumText = field.enumMap
    ? `；枚举值：${Object.entries(field.enumMap)
        .map(([value, label]) => `${value}=${label}`)
        .join("，")}`
    : "";
  const commentText = field.comments?.length > 0 ? `；说明：${field.comments.join(" ")}` : "";

  return `- ${field.key}（${field.label}，类型：${field.type}${enumText}${commentText}）`;
}

export function buildExtractionPrompt(input: BuildExtractionPromptInput): string {
  const ragContext = input.ragContext?.length
    ? input.ragContext.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "无补充知识。";
  const evidenceRequirements = input.evidenceRequirements?.length
    ? input.evidenceRequirements.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : [
        "每个有值字段必须给出 evidence.snippet、evidence.startOffset 和 evidence.endOffset，并尽量给出 pageNumber 或 blockId。",
        "无法判断的字段返回 value: null，rawValue 使用空字符串，confidence 设为 0。",
        "不要输出 schema.fields 之外的字段 key。"
      ].join("\n");

  // Prompt 内允许包含 OCR 原文，因为这是发送给模型完成抽取所需的业务输入；
  // 但 provider 的错误 message / cause 绝不能复用 prompt，以免日志或 API 错误泄漏病历文本。
  return [
    "你是病历结构化抽取引擎，只输出 JSON，不输出解释性文字。",
    "",
    `Schema：${input.schema.label}（${input.schema.key}@${input.schema.version}）`,
    "",
    "字段定义：",
    input.schema.fields.map(formatField).join("\n"),
    "",
    "轻量 RAG 上下文：",
    ragContext,
    "",
    "证据要求：",
    evidenceRequirements,
    "",
    "输出 JSON Schema：",
    JSON.stringify(extractionOutputSchema, null, 2),
    "",
    "OCR 文本：",
    input.ocrText,
    ...(input.imageBase64 ? [
      "",
      "【视觉增强说明】",
      "本次抽取同时提供了原始文档图片。请结合图片进行以下判断：",
      "1. 勾选框识别：对于 list/enum 类型字段，仔细查看图片中对应的勾选框（□），判断哪些被勾选（☑ 或 ✓ 或手写标记）。被勾选的选项加入 list 值，未勾选的不要包含。",
      "2. 手写体修正：OCR 对手写内容识别较差（如身份证号、日期、医生签名、诊断名称等），请对照图片中的手写内容修正 OCR 文本中的错误。",
      "3. 冲突处理：如果图片与 OCR 文本不一致，以图片为准，在 rawValue 中注明 OCR 原文。"
    ] : []),
    ...(input.focusedFieldKeys?.length ? [
      "",
      "【本轮重点抽取字段】",
      `上一轮以下字段缺失或存在冲突，请重点从 OCR 文本和图片中定位并抽取：${input.focusedFieldKeys.join("、")}。`,
      "已确认的字段仍可输出，但务必确保上述重点字段的值、证据和置信度完整。"
    ] : [])
  ].join("\n");
}

export async function extractStructuredFields(
  input: ExtractStructuredFieldsInput
): Promise<ExtractStructuredFieldsResult> {
  try {
    const prompt = buildExtractionPrompt(input);
    const request: ModelExtractionRequest = {
      schema: input.schema,
      prompt,
      ocrText: input.ocrText
    };
    if (input.ragContext !== undefined) {
      request.ragContext = input.ragContext;
    }
    if (input.imageBase64 !== undefined) {
      request.imageBase64 = input.imageBase64;
    }
    const result = await input.provider.extractFields(request);

    return {
      ...result,
      prompt
    };
  } catch (error) {
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCandidateValue(value: unknown): value is ModelFieldCandidate["value"] {
  return (
    value === null ||
    typeof value === "string" ||
    isFiniteNumber(value) ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function getSchemaField(schema: CoreSchemaDraft, fieldKey: string): CoreFieldDefinition | undefined {
  return schema.fields.find((field) => field.key === fieldKey);
}

function matchesSchemaFieldValue(
  value: ModelFieldCandidate["value"],
  field: CoreFieldDefinition
): boolean {
  if (value === null) {
    return true;
  }

  if (field.type === "number") {
    return isFiniteNumber(value);
  }

  if (field.type === "boolean") {
    return typeof value === "boolean";
  }

  if (field.type === "list") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }

  if (field.type === "enum") {
    // Accept any string value — if it doesn't match enumMap keys, it will be
    // preserved as-is (the LLM may return values in a different format than
    // the schema's enumMap, e.g. "peripheral_blood" vs "血液")
    return typeof value === "string";
  }

  return typeof value === "string";
}

export function parseModelExtractionOutput(output: unknown, schema: CoreSchemaDraft): ModelFieldCandidate[] | null {
  const root = typeof output === "string" ? parseJsonObject(output) : output;
  if (!isRecord(root)) {
    console.error("[parseModelExtractionOutput] 根节点不是有效对象", { rawOutput: typeof output === "string" ? output : JSON.stringify(output) });
    return null;
  }
  if (!hasOnlyKeys(root, ["fields"])) {
    console.error("[parseModelExtractionOutput] 根节点包含非法键", { keys: Object.keys(root), rawOutput: JSON.stringify(root) });
    return null;
  }
  if (!Array.isArray(root.fields)) {
    console.error("[parseModelExtractionOutput] fields 不是数组", { rawOutput: JSON.stringify(root) });
    return null;
  }

  if (root.fields.length === 0) {
    console.warn("[parseModelExtractionOutput] fields 数组为空");
    return null;
  }

  const candidates: ModelFieldCandidate[] = [];
  const parseErrors: Array<{ index: number; fieldKey: string; reason: string; rawItem: unknown }> = [];

  for (let index = 0; index < root.fields.length; index++) {
    const item = root.fields[index];

    if (!isRecord(item)) {
      parseErrors.push({ index, fieldKey: "(非对象)", reason: "字段项不是有效对象", rawItem: item });
      continue;
    }

    const fieldKey = typeof item.fieldKey === "string" ? item.fieldKey : "(未知)";
    if (!hasOnlyKeys(item, ["fieldKey", "value", "rawValue", "confidence", "evidence"])) {
      parseErrors.push({ index, fieldKey, reason: `包含非法键: ${Object.keys(item).join(",")}`, rawItem: item });
      continue;
    }

    const schemaField = typeof item.fieldKey === "string" ? getSchemaField(schema, item.fieldKey) : undefined;

    if (typeof item.fieldKey !== "string") {
      parseErrors.push({ index, fieldKey: "(非字符串)", reason: "fieldKey 不是字符串", rawItem: item });
      continue;
    }
    if (schemaField === undefined) {
      parseErrors.push({ index, fieldKey, reason: "fieldKey 在 Schema 中不存在", rawItem: item });
      continue;
    }
    if (!isCandidateValue(item.value)) {
      parseErrors.push({ index, fieldKey, reason: "value 类型不合法", rawItem: item });
      continue;
    }
    if (!matchesSchemaFieldValue(item.value, schemaField)) {
      parseErrors.push({ index, fieldKey, reason: "value 与 Schema 字段类型不匹配", rawItem: item });
      continue;
    }
    if (typeof item.rawValue !== "string") {
      parseErrors.push({ index, fieldKey, reason: "rawValue 不是字符串", rawItem: item });
      continue;
    }
    if (!isFiniteNumber(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      parseErrors.push({ index, fieldKey, reason: `confidence 不合法: ${item.confidence}`, rawItem: item });
      continue;
    }

    const evidence = item.evidence;
    if (!Array.isArray(evidence)) {
      parseErrors.push({ index, fieldKey, reason: "evidence 不是数组", rawItem: item });
      continue;
    }
    if (item.value !== null && evidence.length === 0) {
      parseErrors.push({ index, fieldKey, reason: "value 非空但 evidence 为空", rawItem: item });
      continue;
    }

    const mappedEvidence = evidence.map((evidenceItem, evidenceIndex) => {
      if (
        !isRecord(evidenceItem) ||
        !hasOnlyKeys(evidenceItem, ["snippet", "startOffset", "endOffset", "pageNumber", "blockId"]) ||
        typeof evidenceItem.snippet !== "string" ||
        evidenceItem.snippet.trim().length === 0 ||
        !isFiniteNumber(evidenceItem.startOffset) ||
        !isFiniteNumber(evidenceItem.endOffset) ||
        evidenceItem.startOffset < 0 ||
        evidenceItem.endOffset < evidenceItem.startOffset
      ) {
        return null;
      }

      const mapped: ModelFieldCandidate["evidence"][number] = {
        snippet: evidenceItem.snippet,
        startOffset: evidenceItem.startOffset,
        endOffset: evidenceItem.endOffset
      };
      if (evidenceItem.pageNumber !== undefined && !isFiniteNumber(evidenceItem.pageNumber)) {
        return null;
      }
      if (isFiniteNumber(evidenceItem.pageNumber)) {
        mapped.pageNumber = evidenceItem.pageNumber;
      }
      if (evidenceItem.blockId !== undefined && typeof evidenceItem.blockId !== "string") {
        return null;
      }
      if (typeof evidenceItem.blockId === "string") {
        mapped.blockId = evidenceItem.blockId;
      }

      return mapped;
    });

    if (mappedEvidence.some((evidenceItem) => evidenceItem === null)) {
      parseErrors.push({ index, fieldKey, reason: "evidence 条目解析失败", rawItem: item });
      continue;
    }

    candidates.push({
      fieldKey: item.fieldKey,
      value: item.value,
      rawValue: item.rawValue,
      confidence: item.confidence,
      evidence: mappedEvidence as ModelFieldCandidate["evidence"]
    });
  }

  // 输出解析错误日志，帮助调试但不阻断有效字段
  if (parseErrors.length > 0) {
    console.warn("[parseModelExtractionOutput] 部分字段解析失败（已跳过）", {
      totalFields: root.fields.length,
      successCount: candidates.length,
      errorCount: parseErrors.length,
      errors: parseErrors.map(({ index, fieldKey, reason }) => ({ index, fieldKey, reason })),
      rawFailedItems: parseErrors.map(({ fieldKey, rawItem }) => ({ fieldKey, rawItem }))
    });
  }

  if (candidates.length === 0) {
    console.error("[parseModelExtractionOutput] 所有字段均解析失败", {
      totalFields: root.fields.length,
      parseErrors: parseErrors.map(({ index, fieldKey, reason }) => ({ index, fieldKey, reason }))
    });
    return null;
  }

  return candidates;
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
