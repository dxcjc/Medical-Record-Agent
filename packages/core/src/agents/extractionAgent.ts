import { extractStructuredFields } from "../engine/extractionEngine";
import {
  detectMissingFields,
  runSecondRoundExtraction,
  mergeExtractionResults,
  type MultiRoundExtractionConfig
} from "../engine/extractionCore";
import type { ModelExtractionResult, ModelProvider } from "../providers/providerTypes";
import type { KnowledgeRetrieveRequest, KnowledgeRetriever } from "../rag/inMemoryKnowledgeRetriever";
import type { CoreSchemaDraft } from "../schemas/schemaValidator";

export interface ExtractionAgentInput {
  schema: CoreSchemaDraft;
  ocrText: string;
  targetFieldKeys?: string[];
  imageBase64?: string;  // 原图 base64，用于 LLM 视觉增强
}

export interface ExtractionAgentTrace {
  ragEntryIds: string[];
  ragContext: string[];
}

export interface ExtractionAgentResult extends ModelExtractionResult {
  trace: ExtractionAgentTrace;
}

export interface ExtractionAgent {
  allowedTools: readonly ["knowledge.retrieve", "model.extractFields"];
  run(input: ExtractionAgentInput): Promise<ExtractionAgentResult>;
}

export interface CreateExtractionAgentInput {
  provider: ModelProvider;
  retriever: KnowledgeRetriever;
  multiRound?: MultiRoundExtractionConfig;
}

function buildRetrievalQuery(input: ExtractionAgentInput): string {
  const fieldText = input.targetFieldKeys?.length ? `字段：${input.targetFieldKeys.join(", ")}` : "字段：全部";
  return `${fieldText}\nOCR：${input.ocrText}`;
}

export function createExtractionAgent(config: CreateExtractionAgentInput): ExtractionAgent {
  return {
    allowedTools: ["knowledge.retrieve", "model.extractFields"],
    async run(input) {
      // Extraction Agent 只做两件事：检索受控知识、调用结构化模型抽取。
      // 它不暴露任意工具，也不让模型决定是否访问文件、网络或写回系统。
      const retrieveRequest: KnowledgeRetrieveRequest = {
        query: buildRetrievalQuery(input),
        limit: 5
      };
      if (input.targetFieldKeys !== undefined) {
        retrieveRequest.fieldKeys = input.targetFieldKeys;
      }

      const retrieval = await config.retriever.retrieve(retrieveRequest);
      const extraction = await extractStructuredFields({
        provider: config.provider,
        schema: input.schema,
        ocrText: input.ocrText,
        ragContext: retrieval.context,
        ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {})
      });

      let candidates = extraction.candidates;

      // Multi-round extraction: detect missing fields and run second round
      const multiRoundConfig = config.multiRound;
      const multiRoundEnabled = multiRoundConfig?.enabled !== false;
      if (multiRoundEnabled && candidates.length > 0) {
        const confidenceThreshold = multiRoundConfig?.confidenceThreshold ?? 0.3;
        const missingFields = detectMissingFields(candidates, input.schema, confidenceThreshold);

        if (missingFields.length > 0) {
          console.log("[extractionAgent] 检测到缺失字段，启动第二轮抽取", { missingFields });

          const secondResult = await runSecondRoundExtraction(
            config.provider,
            input.schema,
            input.ocrText,
            missingFields,
            multiRoundConfig?.timeoutMs ?? 60000
          );

          if (secondResult.candidates.length > 0) {
            candidates = mergeExtractionResults(candidates, secondResult.candidates);
            console.log("[extractionAgent] 多轮合并完成", {
              firstRoundCount: extraction.candidates.length,
              secondRoundCount: secondResult.candidates.length,
              mergedCount: candidates.length
            });
          }
        }
      }

      const result: ExtractionAgentResult = {
        providerName: extraction.providerName,
        candidates,
        trace: {
          ragEntryIds: retrieval.entries.map((entry) => entry.id),
          ragContext: retrieval.context
        }
      };
      if (extraction.raw !== undefined) {
        result.raw = extraction.raw;
      }

      return result;
    }
  };
}
