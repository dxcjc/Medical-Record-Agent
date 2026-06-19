import { ProviderError } from "../providers/providerTypes";
import type { AutoDecisionPolicyResult } from "./autoDecisionPolicy";
import type {
  JobError,
  RecognitionRuntimeStatus,
  RecognitionTraceEvent,
  WritebackExecutionResult
} from "./jobOrchestrator";
import type { WritebackNodeResult } from "../nodes/writebackNode";
import type { ValidationEngineResult } from "./validationEngine";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

/**
 * Workflow 共享工具：从 langgraphRecognitionWorkflowV2 抽取的样板函数。
 * 这些函数原本内联在 workflow 文件中，抽取后便于复用与测试。
 */

/** 将 provider/未知错误映射为脱敏的 JobError，避免病历文本泄漏到 error.message。 */
export function mapUnknownError(error: unknown): JobError {
  if (error instanceof ProviderError) {
    const mapped: JobError = {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
    if (error.providerName) {
      mapped.providerName = error.providerName;
    }
    return mapped;
  }

  return {
    code: "WORKFLOW_UNEXPECTED_FAILURE",
    message: "识别流程执行失败，错误已脱敏。",
    retryable: false
  };
}

export function createEmptyValidationResult(): ValidationEngineResult {
  return {
    decision: "blocked",
    fieldResults: [],
    requiredFieldKeys: [],
    missingRequiredFieldKeys: [],
    acceptedFieldKeys: [],
    reviewFieldKeys: [],
    normalizedCandidates: [],
    reextractionFieldKeys: []
  };
}

export function createEmptyDecision(): AutoDecisionPolicyResult {
  return {
    decision: "red",
    shouldWriteback: false,
    reasons: []
  };
}

export function createEmptyWriteback(): WritebackNodeResult {
  return {
    ready: false,
    readyFields: [],
    blockers: []
  };
}

/** resolveStatus 的入参，仅声明它实际读取的字段，避免耦合具体 workflow state。 */
export interface StatusResolutionInput {
  error?: JobError;
  autoDecision?: AutoDecisionPolicyResult;
  writeback?: WritebackNodeResult;
  writebackExecution?: WritebackExecutionResult;
}

/** 根据流程各节点产物推断最终运行时状态。 */
export function resolveStatus(state: StatusResolutionInput): RecognitionRuntimeStatus {
  if (state.error) {
    return state.error.code === "WRITEBACK_FAILED" ? "writeback_failed" : "failed";
  }

  if (state.writebackExecution?.status === "success") {
    return "writeback_completed";
  }

  if (state.autoDecision?.shouldWriteback && state.writeback?.ready) {
    return "writeback_pending";
  }

  if (state.autoDecision?.decision === "red") {
    return "needs_review";
  }

  if (state.autoDecision?.decision === "yellow") {
    return "partial_completed";
  }

  return "completed";
}

/** 生成单条 trace 事件更新（供 LangGraph 节点返回）。 */
export function trace(
  node: RecognitionTraceEvent["node"],
  status: RecognitionTraceEvent["status"],
  message: string
): { trace: RecognitionTraceEvent[] } {
  return {
    trace: [
      {
        node,
        status,
        message
      }
    ]
  };
}

// ── OCR 关键区域漏识检测（P0-2）──

/**
 * 内置默认关键区域关键词表。当字段未显式标注 criticalRegion 时，
 * 按字段 key 匹配默认关键词。覆盖常见病历诊断类字段。
 */
const DEFAULT_CRITICAL_REGION_KEYWORDS: Record<string, string[]> = {
  clinicalDiagnosis: ["病理诊断", "诊断意见", "诊断结果", "临床诊断"],
  pathologicalDiagnosis: ["病理诊断", "诊断意见", "诊断结果"],
  diagnosis: ["诊断", "诊断意见", "诊断结果"],
  tumorType: ["肿瘤类型", "癌种"],
  clinicalStage: ["分期", "临床分期"]
};

/** 关键区域关键词后允许的最小实质内容长度（字符）。低于此值视为漏识。 */
const MIN_CONTENT_LENGTH = 3;

/**
 * 检测 OCR 文本中关键区域的漏识 gap。
 *
 * 判定逻辑：对 schema 中标注了 criticalRegion（或命中默认关键词表）的字段，
 * 检查 OCR 文本是否出现该关键词。若出现，但关键词后 N 字符内无实质内容
 * （仅空白/标点/换行，或长度低于阈值），则判定为该字段漏识。
 *
 * 用途：OCR 漏掉关键诊断文字（如"病理诊断："后内容丢失）时，
 * 返回 gap 列表，供 workflow 强制触发视觉审查兜底。
 */
export interface OcrGap {
  fieldKey: string;
  /** 触发 gap 的关键词 */
  keyword: string;
  /** 人类可读的原因说明 */
  reason: string;
}

export function detectOcrGaps(ocrText: string, schema: CoreSchemaDraft): OcrGap[] {
  if (!ocrText) {
    return [];
  }

  const gaps: OcrGap[] = [];

  for (const field of schema.fields) {
    // 收集该字段的关键区域关键词：显式标注优先，否则按默认表
    const keywords: string[] = [];
    if (field.criticalRegion) {
      keywords.push(field.criticalRegion);
    }
    const defaults = DEFAULT_CRITICAL_REGION_KEYWORDS[field.key];
    if (defaults) {
      keywords.push(...defaults);
    }

    // 去重
    const uniqueKeywords = [...new Set(keywords)];

    for (const keyword of uniqueKeywords) {
      const gap = findKeywordGap(ocrText, keyword, field.key);
      if (gap) {
        gaps.push(gap);
        break; // 同一字段只报告第一个命中的关键词
      }
    }
  }

  return gaps;
}

/**
 * 检查 OCR 文本中指定关键词后是否有实质内容。
 * 返回 OcrGap 表示漏识，返回 null 表示正常（关键词未出现 或 后续有实质内容）。
 */
function findKeywordGap(ocrText: string, keyword: string, fieldKey: string): OcrGap | null {
  const idx = ocrText.indexOf(keyword);
  if (idx === -1) {
    return null;
  }

  // 取关键词之后的全部内容
  const afterKeyword = ocrText.slice(idx + keyword.length);
  // 关键区域内容 = 关键词后到下一个换行为止（本行剩余），若无换行则取到文本结束
  const newlineIdx = afterKeyword.indexOf("\n");
  const lineRemainder = newlineIdx >= 0 ? afterKeyword.slice(0, newlineIdx) : afterKeyword;
  // 去除开头的分隔符（冒号/顿号/逗号/句号/空白），得到实际诊断内容
  const content = lineRemainder.replace(/^[\s:：、，,。.]*/, "").trim();

  // 去除所有标点空白后的实质长度，低于阈值判定为漏识
  const substance = content.replace(/[\s:：、，,。.]/g, "");
  if (substance.length < MIN_CONTENT_LENGTH) {
    return {
      fieldKey,
      keyword,
      reason: `OCR 关键区域"${keyword}"后内容缺失或过短（"${content || "（空）"}"），疑似 OCR 漏识`
    };
  }

  return null;
}
