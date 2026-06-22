import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface SupervisorDecision {
  enableVisualReview: boolean;
  enableRAG: boolean;
  maxRetryRounds: number;
  /**
   * 提取模式（任务3）：
   * - "single"：单次提取,跳过视觉审查和冲突重试,适合单图单次提取场景(1 次 LLM 调用)
   * - "multiSource"：多源验证,启用视觉审查+冲突解决+重试,适合多文档交叉验证
   * 默认 "single"(单图场景),多文档或 OCR gap 命中时切换 "multiSource"。
   */
  extractionMode: "single" | "multiSource";
  reasons: string[];
}

export interface SupervisorNodeInput {
  schema: CoreSchemaDraft;
  documentType?: string;
  hasImage: boolean;
  /** 文档数量(多文档场景)。>1 时切换 multiSource 模式启用多源验证。 */
  documentCount?: number;
}

export interface SupervisorNode {
  decide(input: SupervisorNodeInput): SupervisorDecision;
}

/**
 * Supervisor 节点负责根据文档特征、Schema 复杂度等因素
 * 动态决策执行策略，优化工作流路径。
 *
 * 注意：本节点在 OCR 之前执行，因此不能依赖 OCR 质量做决策。
 * 若未来需要根据 OCR 置信度动态调整（如高置信跳过视觉评审），
 * 应设计为独立的 post-OCR 决策点，而非在此处读取 ocrResult。
 */
export function createSupervisorNode(): SupervisorNode {
  return {
    decide(input) {
      const reasons: string[] = [];
      let enableVisualReview = true;
      let enableRAG = true;
      let maxRetryRounds = 2;
      // 任务3：提取模式。默认 single(单图单次提取),多文档切 multiSource。
      let extractionMode: "single" | "multiSource" = "single";

      // 规则 1：无图片时跳过 Visual Review
      if (!input.hasImage) {
        enableVisualReview = false;
        reasons.push("无图片内容，跳过视觉评审");
      }

      // 规则 2：Schema 字段数少于 5 个时简化流程
      if (input.schema.fields.length < 5) {
        enableRAG = false;
        maxRetryRounds = 1;
        reasons.push("Schema 字段数少，简化 RAG 和重试");
      }

      // 规则 3：文档类型为表格/表单时确保视觉评审开启（视觉识别对结构化表格更准确）
      if (input.documentType === "table" || input.documentType === "form") {
        enableVisualReview = true;
        reasons.push("表格/表单类文档，视觉识别优先");
      }

      // 任务3 规则：多文档(>1)切换 multiSource 模式,启用多源验证。
      // 单图场景用 single 模式:1 次 LLM 调用,跳过视觉审查和冲突重试,把耗时压到 60-120s。
      // 多文档场景需交叉验证,用完整拓扑。OCR gap 兜底(P0-2)在 workflow 层强制覆盖,
      // 此处只按文档数决策。
      const documentCount = input.documentCount ?? 1;
      if (documentCount > 1) {
        extractionMode = "multiSource";
        // 多源模式需要视觉审查做交叉验证,保持开启
        enableVisualReview = true;
        reasons.push(`多文档(${documentCount}张)切换多源验证模式`);
      } else if (enableVisualReview && input.documentType !== "table" && input.documentType !== "form") {
        // 单图且有图:默认 single 模式,关闭视觉审查和重试以压降耗时。
        // 表格/表单例外(规则3已强制开启视觉,保持 multiSource)。
        extractionMode = "single";
        enableVisualReview = false;
        maxRetryRounds = 0;
        reasons.push("单文档采用单次提取模式,跳过视觉审查和重试");
      }

      return {
        enableVisualReview,
        enableRAG,
        maxRetryRounds,
        extractionMode,
        reasons
      };
    }
  };
}
