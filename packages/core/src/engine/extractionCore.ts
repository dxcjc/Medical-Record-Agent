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
}

export interface ExtractStructuredFieldsInput {
  provider: ModelProvider;
  schema: CoreSchemaDraft;
  ocrText: string;
  ragContext?: string[];
  evidenceRequirements?: string[];
  imageBase64?: string;
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

// ── v2 Prompt 常量 ──

const SYSTEM_ROLE_V2 = [
  "你是一名资深肿瘤科病历结构化抽取专家，精通以下领域：",
  "- 肿瘤病理学：熟悉各癌种的组织学分型、免疫组化标志物、分子分型规则",
  "- TNM 分期系统：掌握 AJCC 第 8 版分期标准，理解 pT/pN/m 前缀含义",
  "- 抗肿瘤治疗：了解手术、化疗、放疗、靶向治疗、免疫治疗的规范表述",
  "- 医学 OCR 纠错：能识别 OCR 常见误读（形近字混淆、数字/字母互换），并根据医学语境修正",
  "",
  "你的任务是从 OCR 文本中精准抽取结构化字段。严格遵守以下原则：",
  "1. 只输出 JSON，不输出解释性文字",
  "2. 【不臆造】只抽取文档中明确存在或可直接推断的信息，绝不编造缺失字段的值",
  "3. 【不臆造】当信息缺失或无法确认时，设 value: null，confidence: 0",
  "4. 【不臆造】分期信息不完整时（如只有 T 分期没有 N/M），只输出已有部分，不补造缺失部分",
  "5. 【OCR 修正】对 OCR 文本中明显的医学术语误读，根据上下文自动修正，并在 rawValue 中保留 OCR 原文",
].join("\n");

const FIELD_EXTRACTION_RULES = [
  "【关键字段提取规则】",
  "",
  "A. patientName（患者姓名）提取优先级：",
  "   1) '姓名：XXX'、'患者姓名：XXX'、'病人姓名：XXX' 标签后的值",
  "   2) 文档头部或登记信息中的姓名（通常与年龄同行，如'姓名：张三 年龄：45岁'）",
  "   3) 多文档场景下，以包含'姓名：'标签的文档为准",
  "   4) 注意区分：不要将送检医生、报告医生、审核医生的姓名误认为患者姓名",
  "   5) 不要因为姓名出现在非标准位置就放弃提取，OCR 文本的顺序可能与原文档不一致",
  "",
  "B. hospitalName（医院名称）提取优先级：",
  "   1) 文档头部/抬头的医院名称（如'南京医科大学第一附属医院'、'北京协和医院'）",
  "   2) '送检单位：'、'送检医院：'、'检测机构：'标签后的值",
  "   3) 文档中的医院全称或简称（如'江苏省人民医院'、'北医三院'）",
  "   4) 注意区分：检测公司名（如'燃石医学'、'吉因加'）不是医院名称",
  "   5) '本院'需结合文档上下文推断实际医院名",
  "   6) 医院名称通常出现在 OCR 文本的最开头或前几行，仔细检查",
  "",
  "C. tumorType（癌种/肿瘤类型）标准化规则：",
  "   - 尿路上皮癌（送检部位为膀胱）→ '膀胱癌'",
  "   - 肾细胞癌 → '肾癌'（标准名称）",
  "   - 胃肠道间质瘤 → '胃肠道间质瘤'（4字'胃肠道'，不要简写为'胃肠间质瘤'）",
  "   - 胃的腺癌 → '胃腺癌'（不要简写为'胃癌'）",
  "   - 食管鳞状细胞癌 → '食管癌'（不要细化亚型）",
  "   - 弥漫性胶质瘤 → '胶质瘤'",
  "   - 横纹肌肉瘤 → '横纹肌肉瘤'（不是'癌'，是肉瘤）",
  "   - 非霍奇金淋巴瘤/DLBCL → '非霍奇金淋巴瘤'",
].join("\n");

const ANTI_FABRICATION_RULES = [
  "【核心约束：不臆造（Anti-Fabrication）】",
  "",
  "1. 空值规则：当 OCR 文本中不存在某字段的对应信息时，返回 value: null, rawValue: \"\", confidence: 0。",
  "   - 不要用'未提及'、'不详'、'无'等文字填充本不存在的字段。",
  "   - 仅当文档明确写出'不详'或'无'时，才可以使用这些值。",
  "",
  "2. 分期不补造规则：",
  "   - 如果文档只有 T 分期，不要自行添加 N0M0。",
  "   - 如果文档只有 N 分期，不要自行添加 T 和 M。",
  "",
  "3. 诊断不升级规则：",
  "   - 文档写'倾向腺癌'不要改为'腺癌'（除非后续有补充诊断确认）。",
  "   - 文档写'考虑...来源'不要改为确定性诊断。",
  "",
  "4. 癌种不细化规则：",
  "   - 文档只写'肺癌'不要自行细化为'非小细胞肺癌'或'肺腺癌'。",
  "   - 只有当文档明确写出亚型时才可以使用更具体的名称。",
].join("\n");

const OCR_CORRECTION_HINTS = [
  "【OCR 纠错指南】",
  "",
  "OCR 文本中可能存在以下类型的错误，请根据医学语境自动修正：",
  "",
  "A. 形近字混淆：'腺病'→可能为'腺癌'，'肿摇'→'肿瘤'，'纳理号'→'病理号'，'恶性肿庵'→'恶性肿瘤'",
  "B. 数字/字母互换：'R0S1'→'ROS1'，'Bc1-2'→'Bcl-2'，'D0G-1'→'DOG-1'，'Vi1lin'→'Villin'",
  "C. 医学术语误读：'mLH1'→'MLH1'，'SH2'→'MSH2'，'PS2'→'PMS2'，'Claudn1B2'→'Claudin18.2'",
  "D. 药物名称误读：'贝伐珠丹抗'→'贝伐珠单抗'，'氟尿吨啶'→'氟尿嘧啶'，'卡培地滨'→'卡培他滨'",
  "E. 纠错原则：修正时在 rawValue 中保留 OCR 原文，value 中写修正后的值。仅修正有把握的错误。",
].join("\n");

const CONFIDENCE_GUIDE = [
  "【confidence 评分指南】",
  "  - 0.9-1.0：信息明确、标签清晰、无歧义（如'姓名：张三'）",
  "  - 0.7-0.9：信息较明确但需要少量推断（如从病理诊断推断癌种）",
  "  - 0.5-0.7：信息部分可见或需要较多推断（如手写体、OCR 质量差）",
  "  - 0.0-0.5：信息缺失或高度不确定",
].join("\n");

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

  return [
    // [1] 系统角色（v2 增强版）
    SYSTEM_ROLE_V2,
    "",
    // [2] Schema 元数据
    `Schema：${input.schema.label}（${input.schema.key}@${input.schema.version}）`,
    "",
    // [3] 字段定义
    "字段定义：",
    input.schema.fields.map(formatField).join("\n"),
    "",
    // [4] RAG 上下文
    "领域知识补充：",
    ragContext,
    "",
    // [5] 关键字段提取规则（v2 新增）
    FIELD_EXTRACTION_RULES,
    "",
    // [6] 证据要求 + confidence 指南
    "证据要求：",
    evidenceRequirements,
    "",
    CONFIDENCE_GUIDE,
    "",
    // [7] 不臆造约束（v2 新增）
    ANTI_FABRICATION_RULES,
    "",
    // [8] OCR 纠错提示（v2 新增）
    OCR_CORRECTION_HINTS,
    "",
    // [9] 输出 JSON Schema
    "输出 JSON Schema：",
    JSON.stringify(extractionOutputSchema, null, 2),
    "",
    // [10] OCR 文本
    "OCR 文本：",
    input.ocrText,
    ...(input.imageBase64 ? [
      "",
      "【视觉增强说明】",
      "本次抽取同时提供了原始文档图片。请结合图片进行以下判断：",
      "1. 勾选框识别：对于 list/enum 类型字段，仔细查看图片中对应的勾选框（□），判断哪些被勾选（☑ 或 ✓ 或手写标记）。被勾选的选项加入 list 值，未勾选的不要包含。",
      "2. 手写体修正：OCR 对手写内容识别较差（如身份证号、日期、医生签名、诊断名称等），请对照图片中的手写内容修正 OCR 文本中的错误。",
      "3. 患者姓名和医院名称：如果 OCR 文本中缺少这些信息，请仔细查看图片的页眉、页脚、抬头区域，这些信息可能被 OCR 遗漏。",
      "4. 冲突处理：如果图片与 OCR 文本不一致，以图片为准，在 rawValue 中注明 OCR 原文。"
    ] : [])
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
  if (input.imageBase64 !== undefined) {
    request.imageBase64 = input.imageBase64;
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
  if (value === null) return true;
  if (field.type === "number") return isFiniteNumber(value);
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "list") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (field.type === "enum") return typeof value === "string";
  return typeof value === "string";
}

export function parseModelExtractionOutput(output: unknown, schema: CoreSchemaDraft): ModelFieldCandidate[] | null {
  const root = typeof output === "string" ? parseJsonObject(output) : output;
  if (!isRecord(root)) return null;
  if (!hasOnlyKeys(root, ["fields"])) return null;
  if (!Array.isArray(root.fields)) return null;
  if (root.fields.length === 0) return null;

  const candidates: ModelFieldCandidate[] = [];
  for (const item of root.fields) {
    if (!isRecord(item)) return null;
    if (!hasOnlyKeys(item, ["fieldKey", "value", "rawValue", "confidence", "evidence"])) return null;

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
      (item.value !== null && evidence.length === 0)
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
      if (isFiniteNumber(evidenceItem.pageNumber)) mapped.pageNumber = evidenceItem.pageNumber;
      if (typeof evidenceItem.blockId === "string") mapped.blockId = evidenceItem.blockId;
      return mapped;
    });

    if (mappedEvidence.some((evidenceItem) => evidenceItem === null)) return null;

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
  try { return JSON.parse(text) as unknown; }
  catch { return null; }
}
