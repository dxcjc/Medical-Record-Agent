import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type { OcrResult } from "../providers/providerTypes";

export type ExecutionStrategy =
  | "full"              // 完整流程：RAG + Extraction + Visual + Validation
  | "fast"              // 快速流程：跳过 Visual Review
  | "visual-priority"   // 视觉优先：先 Visual 再 Extraction
  | "extraction-only";  // 仅抽取：跳过 Visual 和 RAG

export interface SupervisorDecision {
  strategy: ExecutionStrategy;
  enableVisualReview: boolean;
  enableRAG: boolean;
  maxRetryRounds: number;
  confidenceThreshold: number;
  reasons: string[];
}

export interface SupervisorAgentInput {
  schema: CoreSchemaDraft;
  documentType?: string;
  ocrResult?: OcrResult;
  hasImage: boolean;
  jobPriority?: "low" | "normal" | "high";
}

export interface SupervisorAgent {
  allowedTools: readonly ["workflow.planExecution"];
  decide(input: SupervisorAgentInput): SupervisorDecision;
}

/**
 * Supervisor Agent 负责根据文档特征、Schema 复杂度、OCR 质量等因素
 * 动态决策执行策略，优化工作流路径。
 */
export function createSupervisorAgent(): SupervisorAgent {
  return {
    allowedTools: ["workflow.planExecution"],
    decide(input) {
      const reasons: string[] = [];
      let strategy: ExecutionStrategy = "full";
      let enableVisualReview = true;
      let enableRAG = true;
      let maxRetryRounds = 2;
      let confidenceThreshold = 0.3;

      // 规则 1：无图片时跳过 Visual Review
      if (!input.hasImage) {
        enableVisualReview = false;
        reasons.push("无图片内容，跳过视觉评审");
      }

      // 规则 2：高优先级任务降低阈值，增加重试次数
      if (input.jobPriority === "high") {
        confidenceThreshold = 0.2;
        maxRetryRounds = 3;
        reasons.push("高优先级任务，降低阈值并增加重试");
      }

      // 规则 3：低优先级任务使用快速策略
      if (input.jobPriority === "low") {
        strategy = "fast";
        enableVisualReview = false;
        maxRetryRounds = 1;
        reasons.push("低优先级任务，使用快速策略");
      }

      // 规则 4：OCR 质量极高时跳过 Visual Review
      if (input.ocrResult && (input.ocrResult as any).confidence && (input.ocrResult as any).confidence > 0.95) {
        enableVisualReview = false;
        reasons.push("OCR 置信度极高，跳过视觉评审");
      }

      // 规则 5：Schema 字段数少于 5 个时简化流程
      if (input.schema.fields.length < 5) {
        enableRAG = false;
        maxRetryRounds = 1;
        reasons.push("Schema 字段数少，简化 RAG 和重试");
      }

      // 规则 6：文档类型为表格时优先使用视觉识别
      if (input.documentType === "table" || input.documentType === "form") {
        strategy = "visual-priority";
        enableVisualReview = true;
        reasons.push("表格/表单类文档，视觉识别优先");
      }

      // 根据 strategy 调整配置
      if (strategy === "fast") {
        enableVisualReview = false;
      }

      return {
        strategy,
        enableVisualReview,
        enableRAG,
        maxRetryRounds,
        confidenceThreshold,
        reasons
      };
    }
  };
}
