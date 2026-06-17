import type { ModelFieldCandidate } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export type ConflictResolutionStrategy =
  | "use_extraction"    // 使用抽取结果
  | "use_visual"        // 使用视觉结果
  | "use_higher_confidence"  // 使用置信度更高的
  | "merge_evidence"    // 合并证据
  | "needs_human_review";  // 需要人工复核

export interface FieldConflict {
  fieldKey: string;
  extractionValue: ModelFieldCandidate["value"];
  extractionConfidence: number;
  visualValue: ModelFieldCandidate["value"];
  visualConfidence: number;
  conflictSeverity: "low" | "medium" | "high";
  resolution: ConflictResolutionStrategy;
  reason: string;
}

export interface ConflictResolutionResult {
  hasConflicts: boolean;
  conflicts: FieldConflict[];
  mergedCandidates: ModelFieldCandidate[];
  needsReextraction: boolean;
  reextractionHints?: {
    fieldKeys: string[];
    hints: string[];
  };
}

export interface ConflictResolutionAgentInput {
  schema: CoreSchemaDraft;
  extractionCandidates: ModelFieldCandidate[];
  visualCandidates: ModelFieldCandidate[];
  conflictThreshold?: number;  // 置信度差异超过此值才算冲突
}

export interface ConflictResolutionAgent {
  allowedTools: readonly ["conflict.detectAndResolve"];
  run(input: ConflictResolutionAgentInput): ConflictResolutionResult;
}

/**
 * 判断两个值是否实质性不同
 */
function valuesConflict(
  value1: ModelFieldCandidate["value"],
  value2: ModelFieldCandidate["value"]
): boolean {
  if (value1 === value2) return false;
  if (value1 == null || value2 == null) return false;  // 一方为空不算冲突

  // 字符串类型：忽略大小写和空格差异
  if (typeof value1 === "string" && typeof value2 === "string") {
    const normalized1 = value1.trim().toLowerCase();
    const normalized2 = value2.trim().toLowerCase();
    return normalized1 !== normalized2;
  }

  // 数组类型：比较元素
  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) return true;
    const set1 = new Set(value1.map(v => String(v).trim().toLowerCase()));
    const set2 = new Set(value2.map(v => String(v).trim().toLowerCase()));
    return set1.size !== set2.size || ![...set1].every(v => set2.has(v));
  }

  return true;
}

/**
 * 计算冲突严重程度
 */
function calculateConflictSeverity(
  extractionConf: number,
  visualConf: number,
  fieldKey: string,
  schema: CoreSchemaDraft
): "low" | "medium" | "high" {
  const field = schema.fields.find(f => f.key === fieldKey);
  const isRequired = field?.required === true;
  const confidenceDiff = Math.abs(extractionConf - visualConf);

  // 关键字段 + 置信度都较高 = 高严重性
  if (isRequired && extractionConf > 0.6 && visualConf > 0.6) {
    return "high";
  }

  // 置信度差异大 = 中等严重性
  if (confidenceDiff > 0.3) {
    return "medium";
  }

  return "low";
}

/**
 * 决定冲突解决策略
 */
function decideResolutionStrategy(
  extractionConf: number,
  visualConf: number,
  severity: "low" | "medium" | "high"
): ConflictResolutionStrategy {
  // 高严重性冲突需要人工复核
  if (severity === "high" && Math.abs(extractionConf - visualConf) < 0.2) {
    return "needs_human_review";
  }

  // 使用置信度更高的
  return "use_higher_confidence";
}

/**
 * Conflict Resolution Agent 负责检测和解决 Extraction 与 Visual Review 之间的冲突
 */
export function createConflictResolutionAgent(): ConflictResolutionAgent {
  return {
    allowedTools: ["conflict.detectAndResolve"],
    run(input) {
      const conflictThreshold = input.conflictThreshold ?? 0.1;
      const conflicts: FieldConflict[] = [];
      const mergedCandidates: ModelFieldCandidate[] = [];

      // 构建字段映射
      const extractionMap = new Map<string, ModelFieldCandidate>();
      for (const candidate of input.extractionCandidates) {
        const existing = extractionMap.get(candidate.fieldKey);
        if (!existing || candidate.confidence > existing.confidence) {
          extractionMap.set(candidate.fieldKey, candidate);
        }
      }

      const visualMap = new Map<string, ModelFieldCandidate>();
      for (const candidate of input.visualCandidates) {
        const existing = visualMap.get(candidate.fieldKey);
        if (!existing || candidate.confidence > existing.confidence) {
          visualMap.set(candidate.fieldKey, candidate);
        }
      }

      // 检测冲突并合并
      const allFieldKeys = new Set([
        ...extractionMap.keys(),
        ...visualMap.keys()
      ]);

      for (const fieldKey of allFieldKeys) {
        const extraction = extractionMap.get(fieldKey);
        const visual = visualMap.get(fieldKey);

        // 只有一方有结果，直接使用
        if (!extraction && visual) {
          mergedCandidates.push(visual);
          continue;
        }
        if (extraction && !visual) {
          mergedCandidates.push(extraction);
          continue;
        }

        // 两方都有结果，检查是否冲突
        if (extraction && visual) {
          const hasConflict = valuesConflict(extraction.value, visual.value);

          if (hasConflict) {
            const severity = calculateConflictSeverity(
              extraction.confidence,
              visual.confidence,
              fieldKey,
              input.schema
            );
            const strategy = decideResolutionStrategy(
              extraction.confidence,
              visual.confidence,
              severity
            );

            let resolvedCandidate: ModelFieldCandidate;
            let reason: string;

            switch (strategy) {
              case "use_higher_confidence":
                if (visual.confidence > extraction.confidence) {
                  resolvedCandidate = visual;
                  reason = `视觉置信度 ${visual.confidence.toFixed(2)} > 抽取置信度 ${extraction.confidence.toFixed(2)}`;
                } else {
                  resolvedCandidate = extraction;
                  reason = `抽取置信度 ${extraction.confidence.toFixed(2)} >= 视觉置信度 ${visual.confidence.toFixed(2)}`;
                }
                break;

              case "needs_human_review":
                // 标记为需要复核，保留抽取结果但降低置信度
                resolvedCandidate = {
                  ...extraction,
                  confidence: Math.min(extraction.confidence, 0.5)
                };
                reason = "高严重性冲突，需要人工复核";
                break;

              default:
                resolvedCandidate = extraction;
                reason = "默认使用抽取结果";
            }

            mergedCandidates.push(resolvedCandidate);

            conflicts.push({
              fieldKey,
              extractionValue: extraction.value,
              extractionConfidence: extraction.confidence,
              visualValue: visual.value,
              visualConfidence: visual.confidence,
              conflictSeverity: severity,
              resolution: strategy,
              reason
            });
          } else {
            // 值相同，合并证据并使用更高置信度
            const mergedCandidate: ModelFieldCandidate = {
              fieldKey,
              value: extraction.value,
              rawValue: extraction.rawValue,
              confidence: Math.max(extraction.confidence, visual.confidence),
              evidence: [
                ...extraction.evidence,
                ...visual.evidence.map(e => ({
                  ...e,
                  snippet: `[视觉] ${e.snippet}`
                }))
              ]
            };
            mergedCandidates.push(mergedCandidate);
          }
        }
      }

      // 检查是否需要重新抽取
      const highSeverityConflicts = conflicts.filter(c => c.conflictSeverity === "high");
      const needsReextraction = highSeverityConflicts.length > 0 &&
        highSeverityConflicts.some(c => c.resolution === "needs_human_review");

      const reextractionHints = needsReextraction ? {
        fieldKeys: highSeverityConflicts.map(c => c.fieldKey),
        hints: highSeverityConflicts.map(c =>
          `字段 ${c.fieldKey}: 抽取值="${c.extractionValue}" vs 视觉值="${c.visualValue}"，请重点确认`
        )
      } : undefined;

      if (conflicts.length > 0) {
        console.log("[conflictResolution] 检测到字段冲突", {
          total: conflicts.length,
          high: conflicts.filter(c => c.conflictSeverity === "high").length,
          medium: conflicts.filter(c => c.conflictSeverity === "medium").length,
          low: conflicts.filter(c => c.conflictSeverity === "low").length,
          needsReextraction
        });
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
        mergedCandidates,
        needsReextraction,
        ...(reextractionHints ? { reextractionHints } : {})
      };
    }
  };
}
