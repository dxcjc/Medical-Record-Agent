import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type {
  ModelFieldCandidate,
  ModelProvider,
  VisualFieldAssessment,
  VisualReviewResult
} from "../providers/providerTypes";

// ── Visual Priority Field Configuration ──

export interface VisualPriorityFieldConfig {
  /** Whether to use visual-first strategy for this field */
  priority: "visual" | "extraction";
  /** Reason for the priority setting */
  reason: string;
  /** Confidence boost applied to visual results for this field (0-1) */
  confidenceBoost: number;
}

/**
 * Default visual priority field configuration.
 * Fields where visual recognition is typically more accurate than OCR+LLM extraction.
 */
export const DEFAULT_VISUAL_PRIORITY_FIELDS: Record<string, VisualPriorityFieldConfig> = {
  // Checkbox fields - visual recognition is more accurate
  patientGender: {
    priority: "visual",
    reason: "勾选项，视觉识别更准确",
    confidenceBoost: 0.2
  },
  // Handwritten fields - visual recognition can弥补 OCR 不足
  patientName: {
    priority: "visual",
    reason: "手写体/页眉区域，视觉识别可弥补OCR遗漏",
    confidenceBoost: 0.15
  },
  // Hospital name - often in header/footer that OCR misses
  hospitalName: {
    priority: "visual",
    reason: "文档抬头/页眉区域，OCR常遗漏",
    confidenceBoost: 0.15
  },
  // Date fields - visual can confirm format
  reportDate: {
    priority: "visual",
    reason: "日期格式，视觉识别可确认格式",
    confidenceBoost: 0.1
  },
  // Sample type - often in checkbox format
  sampleType: {
    priority: "visual",
    reason: "可能为勾选项，视觉识别更准确",
    confidenceBoost: 0.1
  }
};

export interface VisualReviewConfig {
  /** Enable visual review enhancement (default: true) */
  enabled?: boolean;
  /** Visual priority field overrides */
  priorityFields?: Record<string, VisualPriorityFieldConfig>;
  /** Minimum confidence for visual results to be considered (default: 0.3) */
  minConfidence?: number;
  /** Timeout in ms for visual review (default: 90000) */
  timeoutMs?: number;
}

// ── Visual Review Node ──

export interface VisualReviewNodeInput {
  /** 单张原图 base64（单文档场景）。与 images 互斥，images 优先。 */
  imageBase64?: string;
  /** 多张原图 base64 数组（多文档场景）。支持多图输入的视觉模型可一次交叉验证。 */
  images?: string[];
  schema: CoreSchemaDraft;
  ocrText: string;
}

export interface VisualReviewNodeResult extends VisualReviewResult {}

export interface VisualReviewNode {
  run(input: VisualReviewNodeInput): Promise<VisualReviewNodeResult>;
}

export interface CreateVisualReviewNodeInput {
  provider: ModelProvider;
  config?: VisualReviewConfig;
}

function buildVisualReviewPrompt(schema: CoreSchemaDraft, ocrText: string, imageCount = 1): string {
  const fieldList = schema.fields
    .map((f) => {
      const enumHint = f.enumMap
        ? `；枚举值：${Object.entries(f.enumMap).map(([v, l]) => `${v}=${l}`).join("，")}`
        : "";
      const commentHint = f.comments?.length ? `；说明：${f.comments.slice(0, 2).join(" ")}` : "";
      return `- ${f.key}（${f.label}，类型：${f.type}${enumHint}${commentHint}）`;
    })
    .join("\n");

  const multiDocHint = imageCount > 1
    ? [
        "",
        `## 多文档说明`,
        `本次提供 ${imageCount} 张图片，可能来自不同文档（如病理报告 + 影像报告 + 基因检测）。`,
        `请综合所有图片信息，对每个字段判断：信息是否在任意一张图片中存在，并给出最可信的值。`,
        `若同一字段在多张图片中出现冲突，在 reason 中说明并取置信度最高的来源。`,
        ""
      ].join("\n")
    : "";

  return [
    "你是一名医学文档视觉分析专家，擅长从病历图片中精准识别结构化信息。",
    `请仔细查看这${imageCount > 1 ? `${imageCount}张` : "张"}病历图片，完成以下两项任务：`,
    multiDocHint,
    "",
    "## 任务一：验证并补充字段",
    "",
    "对以下每个字段，判断：",
    "1. 该信息是否在图片中存在",
    "2. 如果存在，图片上显示的具体值是什么",
    "3. 你的置信度（0-1）",
    "",
    "字段列表：",
    fieldList,
    "",
    "## 任务二：专项识别",
    "",
    "### A. 勾选框识别",
    "- □ 或 ☐ 表示未勾选",
    "- ☑ 或 ✓ 或 ✔ 或手写对勾/圈注 表示已勾选",
    "- 对于 enum 类型字段（如 patientGender），仔细查看对应的勾选框区域",
    "- 被勾选的选项才是正确值",
    "",
    "### B. 手写体识别",
    "- 注意手写内容可能有连笔、简写、潦草字迹",
    "- 常见手写区域：患者姓名、诊断名称、日期、医生签名",
    "- 如果手写体不确定，在 reason 中注明",
    "",
    "### C. 页眉/页脚/抬头区域",
    "- 仔细查看文档顶部和底部区域",
    "- 医院名称通常在文档抬头（最上方大字）",
    "- 患者姓名可能在页眉或患者信息栏",
    "- OCR 经常遗漏这些区域的信息",
    "",
    "### D. 表格结构识别",
    "- 注意表格的行和列对应关系",
    "- 检查结果数值与项目名称的对应",
    "",
    "## 参考：OCR 文本",
    "以下是从 OCR 文本供参考（可能不完整或有错误）：",
    ocrText.slice(0, 2000),
    "",
    "## 输出格式",
    "请严格按照以下JSON格式输出，所有字段都必须包含：",
    "{",
    '  "fields": [',
    "    {",
    '      "fieldKey": "字段key",',
    '      "value": "图片上看到的值（如果图片上没有该信息则为null）",',
    '      "rawValue": "图片位置:页面左上角;存在:是;描述:简要说明",',
    '      "confidence": 0.9,',
    '      "evidence": [{"snippet": "识别依据说明", "startOffset": 0, "endOffset": 0}]',
    "    }",
    "  ]",
    "}",
    "",
    "注意：",
    "- 只输出上述JSON格式，不要添加其他顶级字段",
    "- value 字段填写图片上显示的实际值，如果图片上完全没有该信息则填 null",
    "- rawValue 格式为：图片位置:xxx;存在:是/否;描述:xxx",
    "- confidence 范围 0-1：0.9+=明确清晰，0.7-0.9=较明确需少量推断，0.5-0.7=部分可见/不确定，<0.5=缺失或高度不确定",
    "- evidence 字段提供识别依据数组，每项含 snippet（说明）、startOffset、endOffset",
    "- 对于 enum 类型字段，value 必须是枚举值之一"
  ].join("\n");
}

export function createVisualReviewNode(config: CreateVisualReviewNodeInput): VisualReviewNode {
  return {
    async run(input) {
      // 收集图片：images 优先（多文档），回退 imageBase64（单文档）
      const images = input.images && input.images.length > 0
        ? input.images
        : input.imageBase64
          ? [input.imageBase64]
          : [];

      const prompt = buildVisualReviewPrompt(input.schema, input.ocrText, images.length);

      const result = await config.provider.extractFields({
        schema: input.schema,
        prompt,
        ocrText: input.ocrText,
        // 多图走 images[]，单图仍走 imageBase64（保持向后兼容）
        ...(images.length > 1
          ? { images }
          : images.length === 1
            ? { imageBase64: images[0] as string }
            : {})
      });

      // 从标准 candidates 格式重建视觉字段评估
      const parsed = convertCandidatesToVisualAssessment(result.candidates, input.schema);

      return {
        providerName: result.providerName,
        ...parsed
      };
    }
  };
}

function convertCandidatesToVisualAssessment(
  candidates: { fieldKey: string; value: string | number | boolean | string[] | null; rawValue: string; confidence: number }[],
  schema: CoreSchemaDraft
): { fieldAssessments: VisualFieldAssessment[]; overallQuality: "high" | "medium" | "low"; imageDescription: string } {
  const fieldAssessments: VisualFieldAssessment[] = candidates.map((c) => {
    // 从 rawValue 解析位置和存在性信息
    const rawParts = parseRawValue(c.rawValue);
    return {
      fieldKey: c.fieldKey,
      existsInImage: c.value !== null || rawParts.exists === "是",
      visualValue: c.value != null ? String(c.value) : null,
      confidence: c.confidence,
      location: rawParts.location || "视觉模型推断"
    };
  });

  // 确保 schema 中的所有字段都有评估
  const assessedKeys = new Set(fieldAssessments.map((a) => a.fieldKey));
  for (const field of schema.fields) {
    if (!assessedKeys.has(field.key)) {
      fieldAssessments.push({
        fieldKey: field.key,
        existsInImage: false,
        visualValue: null,
        confidence: 0,
        location: "未评估"
      });
    }
  }

  // 计算整体质量
  const existingCount = fieldAssessments.filter((a) => a.existsInImage).length;
  const totalCount = fieldAssessments.length;
  const ratio = totalCount > 0 ? existingCount / totalCount : 0;
  const overallQuality: "high" | "medium" | "low" = ratio > 0.6 ? "high" : ratio > 0.3 ? "medium" : "low";

  return {
    fieldAssessments,
    overallQuality,
    imageDescription: `视觉模型评估了 ${totalCount} 个字段，其中 ${existingCount} 个在图片中存在。`
  };
}

function parseRawValue(rawValue: string): { location: string; exists: string; description: string } {
  const result = { location: "", exists: "", description: "" };
  const parts = rawValue.split(";");
  for (const part of parts) {
    const [key, ...valueParts] = part.split(":");
    const value = valueParts.join(":").trim();
    if (key?.trim() === "图片位置") result.location = value;
    else if (key?.trim() === "存在") result.exists = value;
    else if (key?.trim() === "描述") result.description = value;
  }
  return result;
}

// ── Visual Result Merge Logic ──

/**
 * Apply visual priority boost to a field's confidence.
 * For fields configured as visual-priority, the visual result gets a confidence boost.
 */
export function applyVisualPriority(
  fieldKey: string,
  visualConfidence: number,
  config: VisualReviewConfig
): number {
  const priorityFields = config.priorityFields ?? DEFAULT_VISUAL_PRIORITY_FIELDS;
  const fieldConfig = priorityFields[fieldKey];

  if (!fieldConfig || fieldConfig.priority !== "visual") {
    return visualConfidence;
  }

  return Math.min(1.0, visualConfidence + fieldConfig.confidenceBoost);
}
