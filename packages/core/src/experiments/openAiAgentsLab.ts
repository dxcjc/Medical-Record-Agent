import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export type OpenAiAgentsLabDecision = "green" | "needs_review" | "blocked";

export interface OpenAiAgentsLabInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  targetFieldKeys?: string[];
}

export interface OpenAiAgentsLabCandidate {
  fieldKey: string;
  value: unknown;
  confidence: number;
  evidence: string[];
}

export interface OpenAiAgentsLabRunnerResult {
  finalOutput: string;
  trace?: string[];
}

export type OpenAiAgentsLabRunner = (
  agentName: string,
  input: string
) => Promise<OpenAiAgentsLabRunnerResult>;

export interface OpenAiAgentsComparisonLabOptions {
  runner: OpenAiAgentsLabRunner;
}

export interface OpenAiAgentsLabTraceStep {
  agentName: string;
  trace: string[];
}

export interface OpenAiAgentsLabResult {
  candidates: OpenAiAgentsLabCandidate[];
  finalDecision: OpenAiAgentsLabDecision;
  reviewRequired: boolean;
  issues: string[];
  trace: OpenAiAgentsLabTraceStep[];
}

function parseJsonObject(value: string, agentName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 这里不把原始模型输出拼进错误，避免实验日志泄露病历文本。
  }

  throw new Error(`${agentName} 返回的结构化输出不是 JSON object`);
}

function normalizeCandidates(value: unknown): OpenAiAgentsLabCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const fieldKey = typeof record.fieldKey === "string" ? record.fieldKey : "";
      const confidence = typeof record.confidence === "number" ? record.confidence : 0;
      const evidence = Array.isArray(record.evidence)
        ? record.evidence.filter((snippet): snippet is string => typeof snippet === "string")
        : [];

      if (!fieldKey) {
        return null;
      }

      return {
        fieldKey,
        value: record.value,
        confidence,
        evidence
      };
    })
    .filter((item): item is OpenAiAgentsLabCandidate => Boolean(item));
}

function normalizeDecision(value: unknown): OpenAiAgentsLabDecision {
  if (value === "green" || value === "needs_review" || value === "blocked") {
    return value;
  }

  return "needs_review";
}

function buildExtractionPrompt(input: OpenAiAgentsLabInput) {
  const targetFields = input.targetFieldKeys?.length
    ? input.schema.fields.filter((field) => input.targetFieldKeys?.includes(field.key))
    : input.schema.fields;

  return JSON.stringify({
    purpose: "OpenAI Agents SDK 对照实验：抽取字段候选，不进入生产主链路。",
    schemaKey: input.schema.key,
    fields: targetFields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      comments: field.comments,
      enumKeys: field.enumMap ? Object.keys(field.enumMap) : [],
      adapterHints: field.adapterHints ?? {}
    })),
    ocrText: input.ocrText
  });
}

function buildValidationPrompt(input: OpenAiAgentsLabInput, candidates: OpenAiAgentsLabCandidate[]) {
  return JSON.stringify({
    purpose: "OpenAI Agents SDK 对照实验：校验证据和决策，不执行写回。",
    schemaKey: input.schema.key,
    evidencePolicy: input.schema.evidencePolicy,
    candidates
  });
}

/**
 * 创建 OpenAI Agents SDK 对照实验。
 * 真实 SDK 的 Agent/run/tool/handoff 由 runner 适配层注入；core 默认只保存实验协议，
 * 这样 CI 可以用 mock runner 覆盖 specialist 流程，同时不把生产 LangGraph 主链路绑到实验 SDK。
 */
export function createOpenAiAgentsComparisonLab(options: OpenAiAgentsComparisonLabOptions) {
  return {
    kind: "experiment" as const,
    mainlineRecommendation: "keep-langgraph-mainline" as const,
    async run(input: OpenAiAgentsLabInput): Promise<OpenAiAgentsLabResult> {
      const extraction = await options.runner("clinical-extraction-specialist", buildExtractionPrompt(input));
      const extractionPayload = parseJsonObject(extraction.finalOutput, "clinical-extraction-specialist");
      const candidates = normalizeCandidates(extractionPayload.candidates);
      const validation = await options.runner("clinical-validation-specialist", buildValidationPrompt(input, candidates));
      const validationPayload = parseJsonObject(validation.finalOutput, "clinical-validation-specialist");

      return {
        candidates,
        finalDecision: normalizeDecision(validationPayload.decision),
        reviewRequired: validationPayload.reviewRequired === true,
        issues: Array.isArray(validationPayload.issues)
          ? validationPayload.issues.filter((issue): issue is string => typeof issue === "string")
          : [],
        trace: [
          {
            agentName: "clinical-extraction-specialist",
            trace: extraction.trace ?? []
          },
          {
            agentName: "clinical-validation-specialist",
            trace: validation.trace ?? []
          }
        ]
      };
    }
  };
}
