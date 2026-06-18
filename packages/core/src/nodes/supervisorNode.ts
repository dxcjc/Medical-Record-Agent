import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface SupervisorDecision {
  enableVisualReview: boolean;
  enableRAG: boolean;
  maxRetryRounds: number;
  reasons: string[];
}

export interface SupervisorNodeInput {
  schema: CoreSchemaDraft;
  documentType?: string;
  hasImage: boolean;
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

      return {
        enableVisualReview,
        enableRAG,
        maxRetryRounds,
        reasons
      };
    }
  };
}
