import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { createEvaluationAgent, type EvaluationAgentResult } from "../agents/evaluationAgent";
import { createExtractionAgent, type ExtractionAgentResult } from "../agents/extractionAgent";
import { createWritebackAgent, type WritebackAgentResult } from "../agents/writebackAgent";
import { ProviderError, type OcrResult } from "../providers/providerTypes";
import { evaluateAutoDecision, type AutoDecisionPolicyResult } from "./autoDecisionPolicy";
import { runDocumentPipeline } from "./documentPipeline";
import type {
  JobError,
  JobOrchestratorConfig,
  JobOrchestratorInput,
  JobOrchestratorResult,
  RecognitionWorkflow,
  RecognitionRuntimeStatus,
  RecognitionTraceEvent,
  WritebackExecutionResult
} from "./jobOrchestrator";
import { runValidationEngine, type ValidationEngineResult } from "./validationEngine";

interface RecognitionWorkflowState extends JobOrchestratorInput {
  trace: RecognitionTraceEvent[];
  ocr?: OcrResult;
  ocrText?: string;
  extraction?: ExtractionAgentResult;
  validation?: ValidationEngineResult;
  autoDecision?: AutoDecisionPolicyResult;
  writeback?: WritebackAgentResult;
  writebackExecution?: WritebackExecutionResult;
  evaluation?: EvaluationAgentResult;
  status?: RecognitionRuntimeStatus;
  error?: JobError;
}

type LangGraphRecognitionState = typeof RecognitionWorkflowAnnotation.State;

const RecognitionWorkflowAnnotation = Annotation.Root({
  jobId: Annotation<string>,
  document: Annotation<JobOrchestratorInput["document"]>,
  trace: Annotation<RecognitionTraceEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  ocr: Annotation<OcrResult | undefined>,
  ocrText: Annotation<string | undefined>,
  extraction: Annotation<ExtractionAgentResult | undefined>,
  validation: Annotation<ValidationEngineResult | undefined>,
  autoDecision: Annotation<AutoDecisionPolicyResult | undefined>,
  writeback: Annotation<WritebackAgentResult | undefined>,
  writebackExecution: Annotation<WritebackExecutionResult | undefined>,
  evaluation: Annotation<EvaluationAgentResult | undefined>,
  status: Annotation<RecognitionRuntimeStatus | undefined>,
  error: Annotation<JobError | undefined>
});

function trace(node: RecognitionTraceEvent["node"], status: RecognitionTraceEvent["status"], message: string) {
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

function mapUnknownError(error: unknown): JobError {
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

function createEmptyValidationResult(): ValidationEngineResult {
  return {
    decision: "blocked",
    fieldResults: [],
    requiredFieldKeys: [],
    missingRequiredFieldKeys: [],
    acceptedFieldKeys: [],
    reviewFieldKeys: [],
    normalizedCandidates: []
  };
}

function createEmptyDecision(): AutoDecisionPolicyResult {
  return {
    decision: "red",
    shouldWriteback: false,
    reasons: []
  };
}

function createEmptyWriteback(): WritebackAgentResult {
  return {
    ready: false,
    readyFields: [],
    blockers: []
  };
}

function resolveStatus(state: RecognitionWorkflowState): RecognitionRuntimeStatus {
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

export function createLangGraphRecognitionWorkflow(config: JobOrchestratorConfig) {
  const extractionAgent = createExtractionAgent({
    provider: config.modelProvider,
    retriever: config.knowledgeRetriever
  });
  const writebackAgent = createWritebackAgent();
  const evaluationAgent = createEvaluationAgent();

  const preprocessNode = async () => ({
    ...trace("preprocess", "completed", "输入文档已完成预处理。")
  });

  const ocrNode = async (state: RecognitionWorkflowState) => {
    try {
      const result = await runDocumentPipeline({
        provider: config.ocrProvider,
        document: state.document
      });

      return {
        ...trace("ocr", "completed", "OCR 已完成。"),
        ocr: result.ocrResult,
        ocrText: result.ocrText
      };
    } catch (error) {
      return {
        ...trace("ocr", "failed", "OCR provider 调用失败。"),
        status: "failed" as const,
        error: mapUnknownError(error)
      };
    }
  };

  const ragNode = async (state: RecognitionWorkflowState) => {
    if (state.error) {
      return trace("rag", "skipped", "前序节点失败，跳过 RAG。");
    }

    return trace("rag", "completed", "轻量 RAG 将在 Extraction Agent 内按字段限域检索。");
  };

  const extractionNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.ocrText) {
      return trace("extraction", "skipped", "缺少 OCR 文本，跳过抽取。");
    }

    try {
      const imageBase64 = state.document.content
        ? Buffer.from(state.document.content).toString("base64")
        : undefined;

      const extraction = await extractionAgent.run({
        schema: config.schema,
        ocrText: state.ocrText,
        targetFieldKeys: config.schema.fields.map((field) => field.key),
        ...(imageBase64 !== undefined ? { imageBase64 } : {})
      });

      return {
        ...trace("extraction", "completed", "字段抽取已完成。"),
        extraction
      };
    } catch (error) {
      return {
        ...trace("extraction", "failed", "模型 provider 调用失败。"),
        status: "failed" as const,
        error: mapUnknownError(error)
      };
    }
  };

  const validationNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction) {
      return trace("validation", "skipped", "缺少抽取结果，跳过验证。");
    }

    return {
      ...trace("validation", "completed", "字段证据和风险验证已完成。"),
      validation: runValidationEngine({
        schema: config.schema,
        candidates: state.extraction.candidates
      })
    };
  };

  const autoDecisionNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction || !state.validation) {
      return trace("autoDecision", "skipped", "缺少验证结果，跳过自动决策。");
    }

    const writeback = writebackAgent.run({
      schema: config.schema,
      validationDecision: state.validation.decision,
      permissions: config.permissions,
      candidates: state.validation.normalizedCandidates
    });
    const autoDecision = evaluateAutoDecision({
      validation: state.validation,
      candidates: state.validation.normalizedCandidates,
      writeback,
      autoWritebackEnabled: config.autoWritebackEnabled,
      schemaActive: config.schemaActive ?? true,
      hasWritebackPermission: config.permissions.includes("writeback:execute")
    });

    return {
      ...trace("autoDecision", "completed", "自动决策已完成。"),
      writeback,
      autoDecision
    };
  };

  const writebackNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.autoDecision || !state.writeback) {
      return trace("writeback", "skipped", "缺少自动决策，跳过写回检查。");
    }

    if (!state.autoDecision.shouldWriteback || !state.writeback.ready) {
      return trace("writeback", "skipped", "当前结果不触发自动写回。");
    }

    if (!config.writebackExecutor) {
      return trace("writeback", "completed", "写回已进入等待执行状态。");
    }

    const execution = await config.writebackExecutor({
      jobId: state.jobId,
      source: "server-workflow",
      fields: state.writeback.readyFields
    });

    if (execution.status === "failed") {
      return {
        ...trace("writeback", "failed", "写回执行失败。"),
        writebackExecution: execution,
        error: {
          code: "WRITEBACK_FAILED",
          message: execution.errorMessage ?? "写回执行失败。",
          retryable: execution.retryable ?? false
        }
      };
    }

    return {
      ...trace("writeback", "completed", "写回执行完成。"),
      writebackExecution: execution
    };
  };

  const evaluationNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction || !state.validation) {
      return trace("evaluation", "skipped", "缺少可评估结果，跳过评估样本候选生成。");
    }

    const evaluation = evaluationAgent.run({
      documentId: state.document.documentId,
      schema: config.schema,
      validation: state.validation,
      candidates: state.validation.normalizedCandidates,
      markDeidentified: true
    });

    return {
      ...trace("evaluation", "completed", "评估样本候选已生成。"),
      evaluation
    };
  };

  function toJobOrchestratorResult(state: RecognitionWorkflowState): JobOrchestratorResult {
    const status = resolveStatus(state);
    const result: JobOrchestratorResult = {
      jobId: state.jobId,
      status,
      trace: state.trace,
      validation: state.validation ?? createEmptyValidationResult(),
      autoDecision: state.autoDecision ?? createEmptyDecision(),
      writeback: state.writeback ?? createEmptyWriteback()
    };
    if (state.ocr !== undefined) {
      result.ocr = state.ocr;
    }
    if (state.extraction !== undefined) {
      result.extraction = state.extraction;
    }
    if (state.evaluation !== undefined) {
      result.evaluation = state.evaluation;
    }
    if (state.error !== undefined) {
      result.error = state.error;
    }

    return result;
  }

  function normalizeLangGraphState(state: LangGraphRecognitionState): RecognitionWorkflowState {
    const normalized: RecognitionWorkflowState = {
      jobId: state.jobId,
      document: state.document,
      trace: state.trace
    };
    if (state.ocr !== undefined) {
      normalized.ocr = state.ocr;
    }
    if (state.ocrText !== undefined) {
      normalized.ocrText = state.ocrText;
    }
    if (state.extraction !== undefined) {
      normalized.extraction = state.extraction;
    }
    if (state.validation !== undefined) {
      normalized.validation = state.validation;
    }
    if (state.autoDecision !== undefined) {
      normalized.autoDecision = state.autoDecision;
    }
    if (state.writeback !== undefined) {
      normalized.writeback = state.writeback;
    }
    if (state.writebackExecution !== undefined) {
      normalized.writebackExecution = state.writebackExecution;
    }
    if (state.evaluation !== undefined) {
      normalized.evaluation = state.evaluation;
    }
    if (state.status !== undefined) {
      normalized.status = state.status;
    }
    if (state.error !== undefined) {
      normalized.error = state.error;
    }

    return normalized;
  }

  const finalizeNode = async (state: RecognitionWorkflowState) => {
    return {
      status: resolveStatus(state)
    };
  };

  const graph = new StateGraph(RecognitionWorkflowAnnotation)
    .addNode("preprocessNode", preprocessNode)
    .addNode("ocrNode", ocrNode)
    .addNode("ragNode", ragNode)
    .addNode("extractionNode", extractionNode)
    .addNode("validationNode", validationNode)
    .addNode("autoDecisionNode", autoDecisionNode)
    .addNode("writebackNode", writebackNode)
    .addNode("evaluationNode", evaluationNode)
    .addNode("finalizeNode", finalizeNode)
    .addEdge(START, "preprocessNode")
    .addEdge("preprocessNode", "ocrNode")
    .addEdge("ocrNode", "ragNode")
    .addEdge("ragNode", "extractionNode")
    .addEdge("extractionNode", "validationNode")
    .addEdge("validationNode", "autoDecisionNode")
    .addEdge("autoDecisionNode", "writebackNode")
    .addEdge("writebackNode", "evaluationNode")
    .addEdge("evaluationNode", "finalizeNode")
    .addEdge("finalizeNode", END)
    .compile({ name: "medical-record-recognition-workflow" });

  const workflow: RecognitionWorkflow = {
    async invoke(input) {
      const state = await graph.invoke(input);
      return toJobOrchestratorResult(normalizeLangGraphState(state));
    }
  };

  return workflow;
}
