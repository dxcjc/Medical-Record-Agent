import { extractStructuredFields } from "../engine/extractionEngine";
import type { ModelExtractionResult, ModelProvider } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface ExtractionAgentInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  targetFieldKeys?: string[];
  imageBase64?: string;  // 原图 base64，用于 LLM 视觉增强
  ragContext?: string[];  // RAG 上下文由 workflow 层传入
  focusedFieldKeys?: string[];  // 针对性抽取（用于多轮场景）
}

export interface ExtractionAgentResult extends ModelExtractionResult {}

export interface ExtractionAgent {
  allowedTools: readonly ["model.extractFields"];
  run(input: ExtractionAgentInput): Promise<ExtractionAgentResult>;
}

export interface CreateExtractionAgentInput {
  provider: ModelProvider;
}

export function createExtractionAgent(config: CreateExtractionAgentInput): ExtractionAgent {
  return {
    allowedTools: ["model.extractFields"],
    async run(input) {
      // Extraction Agent 专注于结构化抽取，不负责 RAG 检索
      // RAG 上下文由 workflow 层面统一管理和传入
      const extraction = await extractStructuredFields({
        provider: config.provider,
        schema: input.schema,
        ocrText: input.ocrText,
        ragContext: input.ragContext ?? [],
        ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {}),
        ...(input.focusedFieldKeys !== undefined ? { focusedFieldKeys: input.focusedFieldKeys } : {})
      });

      return {
        providerName: extraction.providerName,
        candidates: extraction.candidates,
        ...(extraction.raw !== undefined ? { raw: extraction.raw } : {})
      };
    }
  };
}
