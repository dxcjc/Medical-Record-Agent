import type { KnowledgeBase, KnowledgeEntry } from "./knowledgeBase";

export interface KnowledgeRetrieveRequest {
  query: string;
  fieldKeys?: string[];
  limit?: number;
}

export interface KnowledgeRetrievalResult {
  entries: KnowledgeEntry[];
  context: string[];
  /** L1: field_description entries (guaranteed injection) */
  fieldRules: KnowledgeEntry[];
  /** L2: other entries (RAG-retrieved) */
  ragEntries: KnowledgeEntry[];
}

// 保持向后兼容
export type KnowledgeRetrieveResult = KnowledgeRetrievalResult;

export interface KnowledgeRetriever {
  retrieve(request: KnowledgeRetrieveRequest): Promise<KnowledgeRetrieveResult>;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

const KIND_WEIGHTS: Record<string, number> = {
  "field-description": 5,
  "field_description": 5,
  "staging": 4,
  "gene_detection": 4,
  "treatment": 3,
  "medication": 3,
  "ocr_correction": 3,
  "medical-term": 2,
  "medical_term": 2,
  "sample_type_mapping": 2,
  "gender_inference": 2,
  "cancer-alias": 1,
  "cancer_alias": 1,
  "interpretation_match": 1,
  "cancer_tag": 1,
  "lims-dictionary": 1,
  "lims_dictionary": 1,
};

function hasFieldOverlap(entry: KnowledgeEntry, fieldKeys: readonly string[] | undefined): boolean {
  if (!fieldKeys || fieldKeys.length === 0) {
    return true;
  }

  return entry.fieldKeys.some((fieldKey) => fieldKeys.includes(fieldKey));
}

function scoreEntry(entry: KnowledgeEntry, request: KnowledgeRetrieveRequest): number {
  if (!hasFieldOverlap(entry, request.fieldKeys)) {
    return 0;
  }

  const query = normalizeText(request.query);
  const fieldBonus = request.fieldKeys?.some((fieldKey) => entry.fieldKeys.includes(fieldKey)) ? 3 : 0;
  const keywordScore = entry.keywords.reduce((score, keyword) => {
    return query.includes(normalizeText(keyword)) ? score + 2 : score;
  }, 0);
  const titleScore = query.includes(normalizeText(entry.title)) ? 1 : 0;
  const kindWeight = KIND_WEIGHTS[entry.kind] ?? 1;

  return (fieldBonus + keywordScore + titleScore) * kindWeight;
}

export function createInMemoryKnowledgeRetriever(base: KnowledgeBase): KnowledgeRetriever {
  return {
    async retrieve(request) {
      const limit = request.limit ?? 5;
      
      // L1: field_description entries — guaranteed injection, filtered by field overlap
      const fieldRules = base.entries.filter((entry) =>
        (entry.kind === "field-description" || entry.kind === "field_description") &&
        hasFieldOverlap(entry, request.fieldKeys)
      );
      
      // L2: other entries — RAG-retrieved by keyword matching
      const ragCandidates = base.entries
        .filter((entry) => entry.kind !== "field-description" && entry.kind !== "field_description")
        .map((entry, index) => ({ entry, index, score: scoreEntry(entry, request) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map((item) => item.entry);
      
      const allEntries = [...fieldRules, ...ragCandidates];
      const context = allEntries.map((entry) => `[${entry.kind}] ${entry.title}：${entry.content}`);

      return {
        entries: allEntries,
        context,
        fieldRules,
        ragEntries: ragCandidates
      };
    }
  };
}
