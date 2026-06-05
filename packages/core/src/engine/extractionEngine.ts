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
}

export interface ExtractStructuredFieldsInput {
  provider: ModelProvider;
  schema: CoreSchemaDraft;
  ocrText: string;
  ragContext?: string[];
  evidenceRequirements?: string[];
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
  const commentText = field.comments.length > 0 ? `；说明：${field.comments.join(" ")}` : "";

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
    input.ocrText
  ].join("\n");
}

export async function extractStructuredFields(
  input: ExtractStructuredFieldsInput
): Promise<ExtractStructuredFieldsResult> {
  const prompt = buildExtractionPrompt(input);
  const request: ModelExtractionRequest = {
    schema: input.schema,
    prompt,
    ocrText: input.ocrText
  };
  if (input.ragContext !== undefined) {
    request.ragContext = input.ragContext;
  }
  const result = await input.provider.extractFields(request);

  return {
    ...result,
    prompt
  };
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
    return typeof value === "string" && (!field.enumMap || Object.prototype.hasOwnProperty.call(field.enumMap, value));
  }

  return typeof value === "string";
}

export function parseModelExtractionOutput(output: unknown, schema: CoreSchemaDraft): ModelFieldCandidate[] | null {
  const root = typeof output === "string" ? parseJsonObject(output) : output;
  if (!isRecord(root) || !hasOnlyKeys(root, ["fields"]) || !Array.isArray(root.fields)) {
    return null;
  }

  if (root.fields.length === 0) {
    return null;
  }

  const candidates: ModelFieldCandidate[] = [];
  for (const item of root.fields) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["fieldKey", "value", "rawValue", "confidence", "evidence"])) {
      return null;
    }

    const evidence = item.evidence;
    const schemaField = typeof item.fieldKey === "string" ? getSchemaField(schema, item.fieldKey) : undefined;
    if (
      typeof item.fieldKey !== "string" ||
      schemaField === undefined ||
      !isCandidateValue(item.value) ||
      !matchesSchemaFieldValue(item.value, schemaField) ||
      typeof item.rawValue !== "string" ||
      !isFiniteNumber(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1 ||
      !Array.isArray(evidence) ||
      evidence.length === 0
    ) {
      return null;
    }

    const mappedEvidence = evidence.map((evidenceItem) => {
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
      return null;
    }

    candidates.push({
      fieldKey: item.fieldKey,
      value: item.value,
      rawValue: item.rawValue,
      confidence: item.confidence,
      evidence: mappedEvidence as ModelFieldCandidate["evidence"]
    });
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
