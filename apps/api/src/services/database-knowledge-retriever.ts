import type { KnowledgeEntry, KnowledgeRetrieveRequest, KnowledgeRetrieveResult, KnowledgeRetriever } from "@medical-record-agent/core";

type KnowledgeRepositoryLike = {
  getAllEnabled(): Promise<Array<{
    id: string;
    kind: string;
    title: string;
    content: string;
    keywords: string[];
    fieldKeys: string[];
  }>>;
};

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

function hasFieldOverlap(entry: { fieldKeys: string[] }, fieldKeys: readonly string[] | undefined): boolean {
  if (!fieldKeys || fieldKeys.length === 0) return true;
  return entry.fieldKeys.some((fieldKey) => fieldKeys.includes(fieldKey));
}

function scoreEntry(entry: { kind: string; title: string; keywords: string[]; fieldKeys: string[] }, request: KnowledgeRetrieveRequest): number {
  if (!hasFieldOverlap(entry, request.fieldKeys)) return 0;
  const query = normalizeText(request.query);
  const fieldBonus = request.fieldKeys?.some((fk) => entry.fieldKeys.includes(fk)) ? 3 : 0;
  const keywordScore = entry.keywords.reduce((score, kw) => query.includes(normalizeText(kw)) ? score + 2 : score, 0);
  const titleScore = query.includes(normalizeText(entry.title)) ? 1 : 0;
  const kindWeight = KIND_WEIGHTS[entry.kind] ?? 1;
  return (fieldBonus + keywordScore + titleScore) * kindWeight;
}

/**
 * 数据库驱动的知识检索器。
 * 使用 5 分钟 TTL 缓存减少数据库查询频率。
 * 条目变更后无需重启服务即可在缓存过期后生效。
 */
export function createDatabaseKnowledgeRetriever(repository: KnowledgeRepositoryLike): KnowledgeRetriever {
  let cachedEntries: KnowledgeRepositoryLike["getAllEnabled"] extends () => Promise<infer T> ? Awaited<T> : never[] = [];
  let cacheExpiresAt = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async function getEntriesWithCache() {
    const now = Date.now();
    if (now >= cacheExpiresAt) {
      cachedEntries = await repository.getAllEnabled();
      cacheExpiresAt = now + CACHE_TTL_MS;
    }
    return cachedEntries;
  }

  return {
    async retrieve(request: KnowledgeRetrieveRequest): Promise<KnowledgeRetrieveResult> {
      const limit = request.limit ?? 15;
      const allEntries = await getEntriesWithCache();

      // L1: field_description entries — guaranteed injection
      const fieldRules = allEntries.filter((entry) =>
        (entry.kind === "field-description" || entry.kind === "field_description") &&
        hasFieldOverlap(entry, request.fieldKeys)
      );

      // L2: other entries — RAG-retrieved
      const ragCandidates = allEntries
        .filter((entry) => entry.kind !== "field-description" && entry.kind !== "field_description")
        .map((entry, index) => ({ entry, index, score: scoreEntry(entry, request) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map((item) => item.entry);

      const scored = [...fieldRules, ...ragCandidates];

      return {
        entries: scored as KnowledgeEntry[],
        context: scored.map((entry) => `[${entry.kind}] ${entry.title}：${entry.content}`),
        fieldRules: fieldRules as KnowledgeEntry[],
        ragEntries: ragCandidates as KnowledgeEntry[],
      };
    },
  };
}
