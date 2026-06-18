import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { createEvaluationNode, type EvaluationNodeResult } from "../nodes/evaluationNode";
import { createExtractionNode, type ExtractionNodeResult } from "../nodes/extractionNode";
import { createVisualReviewNode, applyVisualPriority, type VisualReviewNodeResult, type VisualReviewConfig } from "../nodes/visualReviewNode";
import { createWritebackNode, type WritebackNodeResult } from "../nodes/writebackNode";
import { createSupervisorNode, type SupervisorDecision } from "../nodes/supervisorNode";
import { createConflictResolutionNode, type ConflictResolutionResult } from "../nodes/conflictResolutionNode";
import { ProviderError, type OcrResult, type ModelFieldCandidate } from "../providers/providerTypes";
import { evaluateAutoDecision, type AutoDecisionPolicyResult } from "./autoDecisionPolicy";
import { runDocumentPipeline, runMultiDocumentPipeline } from "./documentPipeline";
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
import {
  mapUnknownError,
  createEmptyValidationResult,
  createEmptyDecision,
  createEmptyWriteback,
  resolveStatus,
  trace
} from "./workflowShared";
import type { KnowledgeRetrievalResult } from "../rag/inMemoryKnowledgeRetriever";

interface RecognitionWorkflowState extends JobOrchestratorInput {
  trace: RecognitionTraceEvent[];
  supervisorDecision?: SupervisorDecision;
  ocr?: OcrResult;
  ocrText?: string;
  ragResult?: KnowledgeRetrievalResult;
  extraction?: ExtractionNodeResult;
  visualReview?: VisualReviewNodeResult;
  conflictResolution?: ConflictResolutionResult;
  mergedCandidates?: ModelFieldCandidate[];
  validation?: ValidationEngineResult;
  autoDecision?: AutoDecisionPolicyResult;
  writeback?: WritebackNodeResult;
  writebackExecution?: WritebackExecutionResult;
  evaluation?: EvaluationNodeResult;
  status?: RecognitionRuntimeStatus;
  error?: JobError;
  retryCount?: number;
}

type LangGraphRecognitionState = typeof RecognitionWorkflowAnnotation.State;

const RecognitionWorkflowAnnotation = Annotation.Root({
  jobId: Annotation<string>,
  document: Annotation<JobOrchestratorInput["document"]>,
  documents: Annotation<JobOrchestratorInput["documents"]>,
  schemaKey: Annotation<string | undefined>,
  providerConfig: Annotation<JobOrchestratorInput["providerConfig"]>,
  trace: Annotation<RecognitionTraceEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  supervisorDecision: Annotation<SupervisorDecision | undefined>,
  ocr: Annotation<OcrResult | undefined>,
  ocrText: Annotation<string | undefined>,
  ragResult: Annotation<KnowledgeRetrievalResult | undefined>,
  extraction: Annotation<ExtractionNodeResult | undefined>,
  visualReview: Annotation<VisualReviewNodeResult | undefined>,
  conflictResolution: Annotation<ConflictResolutionResult | undefined>,
  mergedCandidates: Annotation<ModelFieldCandidate[] | undefined>,
  validation: Annotation<ValidationEngineResult | undefined>,
  autoDecision: Annotation<AutoDecisionPolicyResult | undefined>,
  writeback: Annotation<WritebackNodeResult | undefined>,
  writebackExecution: Annotation<WritebackExecutionResult | undefined>,
  evaluation: Annotation<EvaluationNodeResult | undefined>,
  status: Annotation<RecognitionRuntimeStatus | undefined>,
  error: Annotation<JobError | undefined>,
  retryCount: Annotation<number>({
    reducer: (left, right) => right,
    default: () => 0
  })
});

export function createLangGraphRecognitionWorkflowV2(config: JobOrchestratorConfig) {
  const supervisorNode = createSupervisorNode();
  const extractionNode = createExtractionNode({
    provider: config.modelProvider
  });
  const visualReviewNode = createVisualReviewNode({
    provider: config.modelProvider,
    ...(config.visualReview !== undefined ? { config: config.visualReview } : {})
  });
  const conflictResolutionNode = createConflictResolutionNode();
  const writebackNode = createWritebackNode();
  const evaluationNode = createEvaluationNode();

  // ────────────────────────────────────────────────────────────
  // 节点定义
  // ────────────────────────────────────────────────────────────

  const supervisorNodeAction = async (state: RecognitionWorkflowState) => {
    const hasImage = state.documents
      ? state.documents.some(doc => doc.content !== undefined)
      : state.document.content !== undefined;

    const docType = state.document.documentId.includes("table") ? "table" : undefined;

    const decision = supervisorNode.decide({
      schema: config.schema,
      ...(docType ? { documentType: docType } : {}),
      hasImage
    });

    console.log("[supervisor] 执行策略已决策", decision);

    return {
      ...trace("preprocess", "completed", `视觉评审: ${decision.enableVisualReview ? "开" : "关"}；RAG: ${decision.enableRAG ? "开" : "关"}；最大重试: ${decision.maxRetryRounds}。${decision.reasons.length ? " " + decision.reasons.join("; ") : ""}`),
      supervisorDecision: decision
    };
  };

  const ocrNode = async (state: RecognitionWorkflowState) => {
    try {
      const multiDoc = state.documents;
      const hasMultipleDocuments = multiDoc !== undefined && multiDoc.length > 0;
      const result = hasMultipleDocuments
        ? await runMultiDocumentPipeline({
            provider: config.ocrProvider,
            documents: multiDoc
          })
        : await runDocumentPipeline({
            provider: config.ocrProvider,
            document: state.document
          });

      return {
        ...trace("ocr", "completed", hasMultipleDocuments ? `OCR 已完成（${multiDoc.length} 个文件）。` : "OCR 已完成。"),
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

    if (!state.supervisorDecision?.enableRAG) {
      return trace("rag", "skipped", "Supervisor 决策跳过 RAG。");
    }

    if (!state.ocrText) {
      return trace("rag", "skipped", "缺少 OCR 文本，跳过 RAG。");
    }

    try {
      const fieldKeys = config.schema.fields.map(f => f.key);
      const query = `OCR文本：${state.ocrText.slice(0, 500)}`;

      const retrieval = await config.knowledgeRetriever.retrieve({
        query,
        fieldKeys,
        limit: 5
      });

      console.log("[rag] 知识检索完成", {
        entriesCount: retrieval.entries.length,
        contextLength: retrieval.context.length
      });

      return {
        ...trace("rag", "completed", `检索到 ${retrieval.entries.length} 条知识。`),
        ragResult: retrieval
      };
    } catch (error) {
      console.warn("[rag] 知识检索失败，继续执行", error);
      return trace("rag", "degraded", "知识检索失败，使用空上下文继续。");
    }
  };

  const extractionNodeAction = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.ocrText) {
      return trace("extraction", "skipped", "缺少 OCR 文本，跳过抽取。");
    }

    try {
      const hasMultipleDocuments = state.documents !== undefined && state.documents.length > 0;
      const imageBase64 = !hasMultipleDocuments && state.document.content
        ? Buffer.from(state.document.content).toString("base64")
        : undefined;

      const ragContext = state.ragResult?.context ?? [];

      // 反馈循环针对性重抽：合并冲突提示字段和缺失的必填字段，作为本轮聚焦字段。
      // 这样重试不会全量重抽，而是引导模型优先补齐问题字段（focusedFieldKeys 会在 prompt 中体现）。
      const isRetry = (state.retryCount ?? 0) > 0;
      const focusedFieldKeys = isRetry
        ? Array.from(new Set([
            ...(state.conflictResolution?.reextractionHints?.fieldKeys ?? []),
            ...(state.validation?.missingRequiredFieldKeys ?? [])
          ]))
        : undefined;

      const extractionResult = await extractionNode.run({
        schema: config.schema,
        ocrText: state.ocrText,
        targetFieldKeys: config.schema.fields.map((field) => field.key),
        ragContext,
        ...(imageBase64 !== undefined ? { imageBase64 } : {}),
        ...(focusedFieldKeys !== undefined && focusedFieldKeys.length > 0 ? { focusedFieldKeys } : {})
      });

      console.log("[extraction] 字段抽取完成", {
        candidatesCount: extractionResult.candidates.length,
        ragContextUsed: ragContext.length > 0,
        ...(isRetry ? { retryRound: state.retryCount, focusedFieldKeys } : {})
      });

      return {
        ...trace("extraction", "completed", isRetry && focusedFieldKeys?.length
          ? `第 ${state.retryCount} 轮重抽完成，聚焦字段：${focusedFieldKeys.join("、")}。`
          : "字段抽取已完成。"),
        extraction: extractionResult
      };
    } catch (error) {
      return {
        ...trace("extraction", "failed", "模型 provider 调用失败。"),
        status: "failed" as const,
        error: mapUnknownError(error)
      };
    }
  };

  const visualReviewNodeAction = async (state: RecognitionWorkflowState) => {
    if (state.error) {
      return trace("visualReview", "skipped", "前序节点失败，跳过视觉评审。");
    }

    if (!state.supervisorDecision?.enableVisualReview) {
      return trace("visualReview", "skipped", "Supervisor 决策跳过视觉评审。");
    }

    if (!state.extraction) {
      return trace("visualReview", "skipped", "缺少抽取结果，跳过视觉评审。");
    }

    try {
      const hasMultipleDocuments = state.documents !== undefined && state.documents.length > 0;
      if (hasMultipleDocuments) {
        return trace("visualReview", "skipped", "多文档模式暂不支持视觉评审。");
      }

      const imageBase64 = state.document.content
        ? Buffer.from(state.document.content).toString("base64")
        : undefined;

      if (!imageBase64) {
        return trace("visualReview", "skipped", "无图片内容，跳过视觉评审。");
      }

      console.log("[visualReview] 启动视觉评审...");
      const startTime = Date.now();

      const visualResult = await visualReviewNode.run({
        schema: config.schema,
        ocrText: state.ocrText ?? "",
        imageBase64
      });

      const elapsedMs = Date.now() - startTime;
      console.log("[visualReview] 视觉评审完成", {
        elapsedMs,
        overallQuality: visualResult.overallQuality,
        fieldsAssessed: visualResult.fieldAssessments.length
      });

      return {
        ...trace("visualReview", "completed", `视觉评审已完成（${elapsedMs}ms），质量: ${visualResult.overallQuality}。`),
        visualReview: visualResult
      };
    } catch (error) {
      console.warn("[visualReview] 视觉评审失败，继续执行", {
        error: error instanceof Error ? error.message : String(error)
      });
      return trace("visualReview", "degraded", "视觉评审失败，继续执行。");
    }
  };

  const conflictResolutionNodeAction = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction) {
      return trace("conflictResolution", "skipped", "缺少抽取结果，跳过冲突解决。");
    }

    // 如果没有视觉评审结果，直接使用抽取结果
    if (!state.visualReview) {
      return {
        ...trace("conflictResolution", "completed", "无视觉评审结果，直接使用抽取结果。"),
        mergedCandidates: state.extraction.candidates
      };
    }

    // 将视觉评审结果转换为 candidates 格式
    // 修复：必须过滤掉 existsInImage=false 的幻觉值和低置信度结果
    // 修复：对勾选框/手写体字段应用 visual priority boost
    const minConfidence = config.visualReview?.minConfidence ?? 0.3;
    const visualCandidates: ModelFieldCandidate[] = state.visualReview.fieldAssessments
      .filter(a => a.existsInImage && a.visualValue !== null && a.confidence >= minConfidence)
      .map(a => {
        const boostedConfidence = applyVisualPriority(
          a.fieldKey,
          a.confidence,
          config.visualReview ?? {}
        );
        return {
          fieldKey: a.fieldKey,
          value: a.visualValue!,
          rawValue: `[视觉] ${a.visualValue}`,
          confidence: boostedConfidence,
          evidence: [{
            snippet: `视觉识别: ${a.location}`,
            startOffset: 0,
            endOffset: String(a.visualValue).length
          }]
        };
      });

    const resolution = conflictResolutionNode.run({
      schema: config.schema,
      extractionCandidates: state.extraction.candidates,
      visualCandidates
    });

    return {
      ...trace("conflictResolution", "completed", resolution.hasConflicts
        ? `检测到 ${resolution.conflicts.length} 个冲突并已解决。`
        : "无冲突，已合并抽取和视觉结果。"),
      conflictResolution: resolution,
      mergedCandidates: resolution.mergedCandidates
    };
  };

  const validationNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.mergedCandidates) {
      return trace("validation", "skipped", "缺少候选结果，跳过验证。");
    }

    const validation = runValidationEngine({
      schema: config.schema,
      candidates: state.mergedCandidates
    });

    console.log("[validation] 验证完成", {
      decision: validation.decision,
      accepted: validation.acceptedFieldKeys.length,
      review: validation.reviewFieldKeys.length,
      missingRequired: validation.missingRequiredFieldKeys.length
    });

    return {
      ...trace("validation", "completed", "字段证据和风险验证已完成。"),
      validation
    };
  };

  const autoDecisionNode = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction || !state.validation) {
      return trace("autoDecision", "skipped", "缺少验证结果，跳过自动决策。");
    }

    const writeback = writebackNode.run({
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

  const writebackNodeAction = async (state: RecognitionWorkflowState) => {
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

  const evaluationNodeAction = async (state: RecognitionWorkflowState) => {
    if (state.error || !state.extraction || !state.validation) {
      return trace("evaluation", "skipped", "缺少可评估结果，跳过评估样本候选生成。");
    }

    const evaluation = evaluationNode.run({
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

  const finalizeNode = async (state: RecognitionWorkflowState) => {
    return {
      status: resolveStatus(state)
    };
  };

  // 重试闸门节点：每次因冲突或缺失必填字段回到抽取前，先在此自增 retryCount。
  // 原先条件边直接回到 extractionNode，retryCount 从不自增，导致满足重试条件时无限循环
  // （实测会撞 LangGraph 的 recursionLimit）。此节点确保重试计数生效，maxRetryRounds 真正起作用。
  const retryGateNode = async (state: RecognitionWorkflowState) => {
    const nextRetryCount = (state.retryCount ?? 0) + 1;
    return {
      ...trace("validation", "completed", `触发反馈循环，开始第 ${nextRetryCount} 轮重试。`),
      retryCount: nextRetryCount
    };
  };

  // ────────────────────────────────────────────────────────────
  // 条件边函数
  // ────────────────────────────────────────────────────────────

  function shouldRetryExtraction(state: LangGraphRecognitionState): string {
    const retryCount = state.retryCount ?? 0;
    const maxRetries = state.supervisorDecision?.maxRetryRounds ?? 2;

    // 检查是否需要因冲突而重新抽取
    if (state.conflictResolution?.needsReextraction && retryCount < maxRetries) {
      return "retryGateNode";
    }

    // 检查是否因缺失必填字段而重新抽取
    if (state.validation?.missingRequiredFieldKeys.length && retryCount < maxRetries) {
      return "retryGateNode";
    }

    return "autoDecisionNode";
  }

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
      trace: state.trace,
      retryCount: state.retryCount
    };
    if (state.documents !== undefined) {
      normalized.documents = state.documents;
    }
    if (state.schemaKey !== undefined) {
      normalized.schemaKey = state.schemaKey;
    }
    if (state.providerConfig !== undefined) {
      normalized.providerConfig = state.providerConfig;
    }
    if (state.supervisorDecision !== undefined) {
      normalized.supervisorDecision = state.supervisorDecision;
    }
    if (state.ocr !== undefined) {
      normalized.ocr = state.ocr;
    }
    if (state.ocrText !== undefined) {
      normalized.ocrText = state.ocrText;
    }
    if (state.ragResult !== undefined) {
      normalized.ragResult = state.ragResult;
    }
    if (state.extraction !== undefined) {
      normalized.extraction = state.extraction;
    }
    if (state.visualReview !== undefined) {
      normalized.visualReview = state.visualReview;
    }
    if (state.conflictResolution !== undefined) {
      normalized.conflictResolution = state.conflictResolution;
    }
    if (state.mergedCandidates !== undefined) {
      normalized.mergedCandidates = state.mergedCandidates;
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

  // ────────────────────────────────────────────────────────────
  // 构建图
  // ────────────────────────────────────────────────────────────

  const graph = new StateGraph(RecognitionWorkflowAnnotation)
    .addNode("supervisorNode", supervisorNodeAction)
    .addNode("ocrNode", ocrNode)
    .addNode("ragNode", ragNode)
    .addNode("extractionNode", extractionNodeAction)
    .addNode("visualReviewNode", visualReviewNodeAction)
    .addNode("conflictResolutionNode", conflictResolutionNodeAction)
    .addNode("validationNode", validationNode)
    .addNode("autoDecisionNode", autoDecisionNode)
    .addNode("writebackNode", writebackNodeAction)
    .addNode("evaluationNode", evaluationNodeAction)
    .addNode("finalizeNode", finalizeNode)
    .addNode("retryGateNode", retryGateNode)

    // 主流程
    .addEdge(START, "supervisorNode")
    .addEdge("supervisorNode", "ocrNode")
    .addEdge("ocrNode", "ragNode")
    .addEdge("ragNode", "extractionNode")
    .addEdge("extractionNode", "visualReviewNode")
    .addEdge("visualReviewNode", "conflictResolutionNode")
    .addEdge("conflictResolutionNode", "validationNode")

    // 条件边：支持重试（重试分支经 retryGateNode 自增计数后再回抽取）
    .addConditionalEdges("validationNode", shouldRetryExtraction)

    // 重试闸门无条件回到抽取节点
    .addEdge("retryGateNode", "extractionNode")

    .addEdge("autoDecisionNode", "writebackNode")
    .addEdge("writebackNode", "evaluationNode")
    .addEdge("evaluationNode", "finalizeNode")
    .addEdge("finalizeNode", END)
    .compile({ name: "medical-record-recognition-workflow-v2" });

  const workflow: RecognitionWorkflow = {
    async invoke(input) {
      const state = await graph.invoke(input);
      return toJobOrchestratorResult(normalizeLangGraphState(state));
    }
  };

  return workflow;
}
