// TODO(arch-debt): 本文件的 buildExtractionPrompt/extractStructuredFields 与 extractionEngine.ts 重复。
// extractionCore 含多轮抽取逻辑（更完整），extractionEngine 是节点实际使用的轻量版本。
// 二者长期并存是技术债，合并需迁移多轮逻辑，列为后续独立任务，勿在此处临时合并。
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
  /** L1: field_description rules from knowledge base (guaranteed injection) */
  fieldRuleContext?: string[];
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
  // L1: field_description rules — always injected, not dependent on RAG
  const fieldRules = input.fieldRuleContext?.length
    ? input.fieldRuleContext.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "无字段提取规则。";
  
  // L2: RAG context — other knowledge entries
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
    // [3.5] L1: 字段提取规则（强制注入，不依赖RAG）
    "【字段提取规则】（从知识库提取，每个字段的识别方法）",
    fieldRules,
    "",
    // [4] L2: RAG 上下文（按需检索的领域知识）
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

// ── Multi-round extraction (P1) ──

/**
 * Multi-round extraction configuration.
 */
export interface MultiRoundExtractionConfig {
  /** Enable multi-round extraction (default: true) */
  enabled?: boolean;
  /** Confidence threshold below which a field is considered missing (default: 0.3) */
  confidenceThreshold?: number;
  /** Timeout in ms for the second round extraction (default: 60000) */
  timeoutMs?: number;
}

/**
 * Second-round extraction result with timing metadata.
 */
export interface SecondRoundResult {
  candidates: ModelFieldCandidate[];
  missingFields: string[];
  elapsedMs: number;
  timedOut: boolean;
}

/**
 * Detect fields that are missing (null/empty value) or have low confidence
 * from the first-round extraction results.
 *
 * @param candidates - First-round extraction candidates
 * @param schema - Schema defining which fields are expected
 * @param confidenceThreshold - Fields below this threshold are considered missing (default: 0.3)
 * @returns Array of field keys that need re-extraction
 */
export function detectMissingFields(
  candidates: ModelFieldCandidate[],
  schema: CoreSchemaDraft,
  confidenceThreshold: number = 0.3
): string[] {
  // Build a map of fieldKey -> best candidate (highest confidence)
  const candidateMap = new Map<string, ModelFieldCandidate>();
  for (const candidate of candidates) {
    const existing = candidateMap.get(candidate.fieldKey);
    if (!existing || candidate.confidence > existing.confidence) {
      candidateMap.set(candidate.fieldKey, candidate);
    }
  }

  const missing: string[] = [];
  for (const field of schema.fields) {
    const candidate = candidateMap.get(field.key);
    if (!candidate) {
      // Field not present in extraction results at all
      missing.push(field.key);
    } else if (candidate.value === null || candidate.value === "" ||
      (Array.isArray(candidate.value) && candidate.value.length === 0)) {
      // Field present but has null/empty value
      missing.push(field.key);
    } else if (candidate.confidence < confidenceThreshold) {
      // Field present with value but low confidence
      missing.push(field.key);
    }
  }

  return missing;
}

// ── Second-round prompt ──

const SECOND_ROUND_SYSTEM_ROLE = [
  "你是一个医学病历识别专家，正在进行第二轮定向抽取。",
  "第一轮抽取遗漏了以下字段，请从 OCR 文本中仔细寻找这些字段的值。",
  "",
  "注意事项：",
  "1. 只抽取指定的字段，不要抽取其他字段",
  "2. 只输出 JSON，不输出解释性文字",
  "3. 当信息确实不存在时，返回 value: null，confidence: 0",
  "4. 不要编造缺失信息"
].join("\n");

const SECOND_ROUND_FIELD_DESCRIPTIONS: Record<string, string> = {
  cancerType: "肿瘤类型/癌种（如：肺癌、胃癌、乳腺癌等）。从病理诊断中推断。",
  patientGender: "患者性别（男/女）。通常在患者基本信息区域。",
  hospitalName: "医院名称。通常在文档抬头或送检单位处。",
  sampleType: "样本类型（组织/血液/骨髓等）。",
  reportDate: "报告日期。格式通常为 YYYY-MM-DD 或 YYYY年MM月DD日。",
  patientName: "患者姓名。注意与医生姓名区分。",
  patientAge: "患者年龄。通常与姓名同行。",
  tumorType: "肿瘤类型/癌种。标准化名称，如：肺癌、胃癌、乳腺癌等。",
  pathologyNo: "病理号/病理编号。",
  pathologicalDiagnosis: "病理诊断。病理医师给出的诊断结论。",
  clinicalDiagnosis: "临床诊断。",
  smokingHistory: "吸烟史。",
  specimenType: "标本类型/样本类型。",
};

/**
 * Build a targeted second-round prompt for extracting only the missing fields.
 *
 * @param ocrText - The original OCR text
 * @param missingFields - Field keys that need re-extraction
 * @param schema - Schema for field definitions
 * @returns Prompt string for the second-round LLM call
 */
export function buildSecondRoundPrompt(
  ocrText: string,
  missingFields: string[],
  schema: CoreSchemaDraft
): string {
  const fieldList = missingFields.map(fieldKey => {
    const schemaField = schema.fields.find(f => f.key === fieldKey);
    const label = schemaField?.label ?? fieldKey;
    const desc = SECOND_ROUND_FIELD_DESCRIPTIONS[fieldKey]
      ?? `请从 OCR 文本中查找 ${label} 的值。`;
    const enumHint = schemaField?.enumMap
      ? `；枚举值：${Object.entries(schemaField.enumMap).map(([k, v]) => `${k}=${v}`).join("，")}`
      : "";
    return `- ${fieldKey}（${label}）：${desc}${enumHint}`;
  }).join("\n");

  const outputFieldsJson = missingFields.map(f => `  "${f}": "..."`).join(",\n");

  return [
    SECOND_ROUND_SYSTEM_ROLE,
    "",
    "## 需要提取的字段",
    fieldList,
    "",
    "## OCR 文本",
    ocrText,
    "",
    "## 输出格式",
    "请以 JSON 格式返回结果，只包含上述字段。如果无法识别某个字段，返回空字符串。",
    "",
    "示例：",
    `{`,
    outputFieldsJson,
    `}`,
    "",
    "注意：",
    "1. 只返回 JSON，不要有其他内容",
    "2. 字段值尽量简洁，不要包含多余信息",
    "3. 如果无法识别，返回空字符串"
  ].join("\n");
}

/**
 * Parse a simplified second-round JSON response into ModelFieldCandidate array.
 * The second round returns a flat JSON object (not the { fields: [...] } format),
 * so this parser converts it to the standard candidate format.
 */
export function parseSecondRoundOutput(
  output: unknown,
  schema: CoreSchemaDraft,
  missingFields: string[]
): ModelFieldCandidate[] | null {
  const root = typeof output === "string" ? parseJsonObject(output) : output;
  if (!isRecord(root)) return null;

  const candidates: ModelFieldCandidate[] = [];
  for (const fieldKey of missingFields) {
    const rawValue = root[fieldKey];
    if (rawValue === undefined) continue;

    const schemaField = schema.fields.find(f => f.key === fieldKey);
    if (!schemaField) continue;

    // Normalize value: empty string → null
    let value: ModelFieldCandidate["value"] = null;
    let rawValueStr = "";
    let confidence = 0;

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      rawValueStr = rawValue.trim();
      value = rawValueStr;
      // Assign a reasonable confidence for second-round results
      confidence = 0.75;
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      rawValueStr = String(rawValue);
      value = rawValue;
      confidence = 0.75;
    } else if (Array.isArray(rawValue) && rawValue.every(v => typeof v === "string")) {
      rawValueStr = rawValue.join(", ");
      value = rawValue as string[];
      confidence = 0.75;
    }

    if (value !== null) {
      candidates.push({
        fieldKey,
        value,
        rawValue: rawValueStr,
        confidence,
        evidence: [{
          snippet: rawValueStr,
          startOffset: 0,
          endOffset: rawValueStr.length
        }]
      });
    }
  }

  return candidates.length > 0 ? candidates : null;
}

/**
 * Merge two rounds of extraction results.
 * Strategy:
 * 1. If only one round has a value for a field, use that value
 * 2. If both rounds have values, use the one with higher confidence
 * 3. If confidence is equal, prefer the first round (conservative)
 *
 * @param firstRound - Candidates from the first round
 * @param secondRound - Candidates from the second round
 * @returns Merged candidates array
 */
export function mergeExtractionResults(
  firstRound: ModelFieldCandidate[],
  secondRound: ModelFieldCandidate[]
): ModelFieldCandidate[] {
  // Build map of fieldKey -> best candidate per round
  const bestByField = new Map<string, ModelFieldCandidate>();

  // Process first round
  for (const candidate of firstRound) {
    const existing = bestByField.get(candidate.fieldKey);
    if (!existing || candidate.confidence > existing.confidence) {
      bestByField.set(candidate.fieldKey, candidate);
    }
  }

  // Merge second round (override only when better)
  for (const candidate of secondRound) {
    if (candidate.value === null) continue;

    const existing = bestByField.get(candidate.fieldKey);
    if (!existing) {
      // First round had no result at all → use second round
      bestByField.set(candidate.fieldKey, candidate);
    } else if (existing.value === null || existing.value === "" ||
      (Array.isArray(existing.value) && existing.value.length === 0)) {
      // First round had empty/null value → use second round
      bestByField.set(candidate.fieldKey, candidate);
    } else if (candidate.confidence > existing.confidence) {
      // Second round has higher confidence → use second round
      bestByField.set(candidate.fieldKey, candidate);
    }
    // Otherwise keep first round (conservative: equal confidence → first round wins)
  }

  return Array.from(bestByField.values());
}

/**
 * Run the second round extraction with timeout protection.
 *
 * @param provider - Model provider for LLM calls
 * @param schema - Schema for field definitions
 * @param ocrText - Original OCR text
 * @param missingFields - Fields to re-extract
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns SecondRoundResult with candidates and metadata, or null on failure
 */
export async function runSecondRoundExtraction(
  provider: ModelProvider,
  schema: CoreSchemaDraft,
  ocrText: string,
  missingFields: string[],
  timeoutMs: number = 60000
): Promise<SecondRoundResult> {
  const startTime = Date.now();

  try {
    const prompt = buildSecondRoundPrompt(ocrText, missingFields, schema);

    // Use Promise.race for timeout
    const extractionPromise = provider.extractFields({
      schema,
      prompt,
      ocrText
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("SECOND_ROUND_TIMEOUT"));
      }, timeoutMs);
    });

    const result = await Promise.race([extractionPromise, timeoutPromise]);
    const elapsedMs = Date.now() - startTime;

    console.log("[multiRound] 第二轮抽取完成", {
      elapsedMs,
      missingFields,
      candidateCount: result.candidates.length
    });

    return {
      candidates: result.candidates,
      missingFields,
      elapsedMs,
      timedOut: false
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.message === "SECOND_ROUND_TIMEOUT";

    console.warn("[multiRound] 第二轮抽取失败", {
      elapsedMs,
      timedOut: isTimeout,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      candidates: [],
      missingFields,
      elapsedMs,
      timedOut: isTimeout
    };
  }
}

/**
 * Main multi-round extraction orchestrator.
 * Runs first-round extraction, detects missing fields, optionally runs
 * second-round targeted extraction, and merges results.
 *
 * @param input - Extraction input with provider, schema, OCR text, etc.
 * @param config - Multi-round extraction configuration
 * @returns Extraction result with merged candidates from both rounds
 */
export async function extractWithMultiRound(
  input: ExtractStructuredFieldsInput,
  config: MultiRoundExtractionConfig = {}
): Promise<ExtractStructuredFieldsResult & { secondRound?: SecondRoundResult }> {
  const {
    enabled = true,
    confidenceThreshold = 0.3,
    timeoutMs = 60000
  } = config;

  // First round: standard extraction
  const firstResult = await extractStructuredFields(input);

  if (!enabled) {
    return firstResult;
  }

  // Detect missing fields
  const missingFields = detectMissingFields(
    firstResult.candidates,
    input.schema,
    confidenceThreshold
  );

  if (missingFields.length === 0) {
    console.log("[multiRound] 第一轮抽取完整，无需第二轮。");
    return firstResult;
  }

  console.log("[multiRound] 检测到缺失字段，启动第二轮抽取", {
    missingFields,
    totalCandidates: firstResult.candidates.length
  });

  // Second round: targeted extraction for missing fields
  const secondResult = await runSecondRoundExtraction(
    input.provider,
    input.schema,
    input.ocrText,
    missingFields,
    timeoutMs
  );

  // Merge results
  const mergedCandidates = mergeExtractionResults(
    firstResult.candidates,
    secondResult.candidates
  );

  console.log("[multiRound] 合并完成", {
    firstRoundCount: firstResult.candidates.length,
    secondRoundCount: secondResult.candidates.length,
    mergedCount: mergedCandidates.length,
    timedOut: secondResult.timedOut
  });

  return {
    ...firstResult,
    candidates: mergedCandidates,
    secondRound: secondResult
  };
}
