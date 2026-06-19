import type { EvaluationNodeResult } from "../nodes/evaluationNode";
import type { ExtractionNodeResult } from "../nodes/extractionNode";
import type { WritebackNodeResult, WritebackReadyField } from "../nodes/writebackNode";
import type {
  ModelProvider,
  OcrDocumentInput,
  OcrProvider,
  OcrResult
} from "../providers/providerTypes";
import type { KnowledgeRetriever } from "../rag/inMemoryKnowledgeRetriever";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type { AutoDecisionPolicyResult } from "./autoDecisionPolicy";
import type { MultiRoundExtractionConfig } from "./extractionCore";
import type { VisualReviewConfig } from "../nodes/visualReviewNode";
import { createLangGraphRecognitionWorkflowV2 } from "./langgraphRecognitionWorkflowV2";
import type { ValidationEngineResult } from "./validationEngine";

export type RecognitionRuntimeStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial_completed"
  | "needs_review"
  | "writeback_pending"
  | "writeback_completed"
  | "writeback_failed"
  | "failed";

export interface JobStatusTransition {
  jobId: string;
  status: RecognitionRuntimeStatus;
  message: string;
}

export interface JobRepository {
  recordTransition(transition: JobStatusTransition): Promise<void>;
}

export interface InMemoryJobRepository extends JobRepository {
  getTransitions(jobId: string): JobStatusTransition[];
}

export interface WritebackExecutionInput {
  jobId: string;
  fields: WritebackReadyField[];
  source: "server-workflow";
}

export interface WritebackExecutionResult {
  status: "success" | "failed";
  receiptId?: string;
  retryable?: boolean;
  errorMessage?: string;
}

export type WritebackExecutor = (input: WritebackExecutionInput) => Promise<WritebackExecutionResult>;

export interface RecognitionTraceEvent {
  node:
    | "preprocess"
    | "ocr"
    | "rag"
    | "extraction"
    | "visualReview"
    | "conflictResolution"
    | "validation"
    | "autoDecision"
    | "writeback"
    | "evaluation";
  status: "completed" | "skipped" | "failed" | "degraded";
  message: string;
}

export interface JobError {
  code: string;
  message: string;
  retryable: boolean;
  providerName?: string;
}

export interface JobOrchestratorInput {
  jobId: string;
  schemaKey?: string;
  document: OcrDocumentInput;
  documents?: readonly OcrDocumentInput[];
  providerConfig?: {
    ocrProviderKey?: string;
    providerKey?: string;
    /**
     * 视觉审查专用 provider key（可选）。指定后用该 provider 做视觉审查，
     * 通常配置为支持多图的多模态模型；未指定则回退到 providerKey 的模型。
     */
    visualProviderKey?: string;
  };
}

export interface JobOrchestratorResult {
  jobId: string;
  status: RecognitionRuntimeStatus;
  trace: RecognitionTraceEvent[];
  ocr?: OcrResult;
  extraction?: ExtractionNodeResult;
  validation: ValidationEngineResult;
  autoDecision: AutoDecisionPolicyResult;
  writeback: WritebackNodeResult;
  evaluation?: EvaluationNodeResult;
  error?: JobError;
}

export interface RecognitionWorkflow {
  invoke(input: JobOrchestratorInput): Promise<JobOrchestratorResult>;
}

export interface JobOrchestratorConfig {
  repository: JobRepository;
  schema: CoreSchemaDraft;
  ocrProvider: OcrProvider;
  modelProvider: ModelProvider;
  /**
   * 视觉审查专用模型 provider（多模态）。未配置时回退到 modelProvider。
   * 允许视觉审查使用专门的多模态模型（如豆包 vision），
   * 文本抽取仍用纯文本模型，避免共用导致视觉能力受限或成本浪费。
   */
  visualModelProvider?: ModelProvider;
  knowledgeRetriever: KnowledgeRetriever;
  permissions: string[];
  autoWritebackEnabled: boolean;
  schemaActive?: boolean;
  writebackExecutor?: WritebackExecutor;
  multiRound?: MultiRoundExtractionConfig;
  visualReview?: VisualReviewConfig;
}

export interface JobOrchestrator {
  workflow: RecognitionWorkflow;
  start(input: JobOrchestratorInput): Promise<JobOrchestratorResult>;
}

export function createInMemoryJobRepository(): InMemoryJobRepository {
  const transitions = new Map<string, JobStatusTransition[]>();

  return {
    async recordTransition(transition) {
      const current = transitions.get(transition.jobId) ?? [];
      transitions.set(transition.jobId, [...current, transition]);
    },
    getTransitions(jobId) {
      return transitions.get(jobId) ?? [];
    }
  };
}

export function createJobOrchestrator(config: JobOrchestratorConfig): JobOrchestrator {
  // 使用 V2 workflow，支持 Supervisor、冲突解决和反馈循环
  const workflow = createLangGraphRecognitionWorkflowV2(config);

  return {
    workflow,
    async start(input) {
      await config.repository.recordTransition({
        jobId: input.jobId,
        status: "queued",
        message: "任务已入队。"
      });
      await config.repository.recordTransition({
        jobId: input.jobId,
        status: "running",
        message: "任务开始执行。"
      });

      const result = await workflow.invoke(input);
      await config.repository.recordTransition({
        jobId: input.jobId,
        status: result.status,
        message: result.error?.message ?? "任务执行完成。"
      });

      return result;
    }
  };
}
