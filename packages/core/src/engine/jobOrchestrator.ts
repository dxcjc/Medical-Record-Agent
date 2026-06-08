import type { EvaluationAgentResult } from "../agents/evaluationAgent";
import type { ExtractionAgentResult } from "../agents/extractionAgent";
import type { WritebackAgentResult, WritebackReadyField } from "../agents/writebackAgent";
import type {
  ModelProvider,
  OcrDocumentInput,
  OcrProvider,
  OcrResult
} from "../providers/providerTypes";
import type { KnowledgeRetriever } from "../rag/inMemoryKnowledgeRetriever";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";
import type { AutoDecisionPolicyResult } from "./autoDecisionPolicy";
import { createLangGraphRecognitionWorkflow } from "./langgraphRecognitionWorkflow";
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
    | "validation"
    | "autoDecision"
    | "writeback"
    | "evaluation";
  status: "completed" | "skipped" | "failed";
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
  providerConfig?: {
    ocrProviderKey?: string;
    providerKey?: string;
  };
}

export interface JobOrchestratorResult {
  jobId: string;
  status: RecognitionRuntimeStatus;
  trace: RecognitionTraceEvent[];
  ocr?: OcrResult;
  extraction?: ExtractionAgentResult;
  validation: ValidationEngineResult;
  autoDecision: AutoDecisionPolicyResult;
  writeback: WritebackAgentResult;
  evaluation?: EvaluationAgentResult;
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
  knowledgeRetriever: KnowledgeRetriever;
  permissions: string[];
  autoWritebackEnabled: boolean;
  schemaActive?: boolean;
  writebackExecutor?: WritebackExecutor;
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
  const workflow = createLangGraphRecognitionWorkflow(config);

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
