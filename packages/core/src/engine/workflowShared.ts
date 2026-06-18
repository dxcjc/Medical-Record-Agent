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
    normalizedCandidates: []
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
