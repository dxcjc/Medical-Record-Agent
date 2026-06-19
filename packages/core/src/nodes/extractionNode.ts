import { extractStructuredFields } from "../engine/extractionEngine";
import type { ModelExtractionResult, ModelProvider } from "../providers/providerTypes";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface ExtractionNodeInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  targetFieldKeys?: string[];
  imageBase64?: string;  // 原图 base64，用于 LLM 视觉增强
  ragContext?: string[];  // RAG 上下文由 workflow 层传入
  fieldRuleContext?: string[];  // L1: field_description rules (guaranteed injection)
  focusedFieldKeys?: string[];  // 针对性抽取（用于多轮/重试场景）
}

export interface ExtractionNodeResult extends ModelExtractionResult {}

export interface ExtractionNode {
  run(input: ExtractionNodeInput): Promise<ExtractionNodeResult>;
}

export interface CreateExtractionNodeInput {
  provider: ModelProvider;
}

export function createExtractionNode(config: CreateExtractionNodeInput): ExtractionNode {
  return {
    async run(input) {
      // Extraction 节点专注于结构化抽取，不负责 RAG 检索
      // RAG 上下文由 workflow 层面统一管理和传入
      const extraction = await extractStructuredFields({
        provider: config.provider,
        schema: input.schema,
        ocrText: input.ocrText,
        ragContext: input.ragContext ?? [],
        fieldRuleContext: input.fieldRuleContext ?? [],
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
