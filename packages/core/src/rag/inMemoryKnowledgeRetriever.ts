import type { KnowledgeBase, KnowledgeEntry } from "./knowledgeBase";

export interface KnowledgeRetrieveRequest {
  query: string;
  fieldKeys?: string[];
  limit?: number;
}

export interface KnowledgeRetrievalResult {
  entries: KnowledgeEntry[];
  context: string[];
}

// 保持向后兼容
export type KnowledgeRetrieveResult = KnowledgeRetrievalResult;

export interface KnowledgeRetriever {
  retrieve(request: KnowledgeRetrieveRequest): Promise<KnowledgeRetrieveResult>;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

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

  return fieldBonus + keywordScore + titleScore;
}

export function createInMemoryKnowledgeRetriever(base: KnowledgeBase): KnowledgeRetriever {
  return {
    async retrieve(request) {
      const limit = request.limit ?? 5;
      const scored = base.entries
        .map((entry, index) => ({ entry, index, score: scoreEntry(entry, request) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map((item) => item.entry);

      return {
        entries: scored,
        context: scored.map((entry) => `[${entry.kind}] ${entry.title}：${entry.content}`)
      };
    }
  };
}
