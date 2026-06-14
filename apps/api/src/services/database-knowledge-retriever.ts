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

function hasFieldOverlap(entry: { fieldKeys: string[] }, fieldKeys: readonly string[] | undefined): boolean {
  if (!fieldKeys || fieldKeys.length === 0) return true;
  return entry.fieldKeys.some((fieldKey) => fieldKeys.includes(fieldKey));
}

function scoreEntry(entry: { title: string; keywords: string[]; fieldKeys: string[] }, request: KnowledgeRetrieveRequest): number {
  if (!hasFieldOverlap(entry, request.fieldKeys)) return 0;
  const query = normalizeText(request.query);
  const fieldBonus = request.fieldKeys?.some((fk) => entry.fieldKeys.includes(fk)) ? 3 : 0;
  const keywordScore = entry.keywords.reduce((score, kw) => query.includes(normalizeText(kw)) ? score + 2 : score, 0);
  const titleScore = query.includes(normalizeText(entry.title)) ? 1 : 0;
  return fieldBonus + keywordScore + titleScore;
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
      const limit = request.limit ?? 5;
      const allEntries = await getEntriesWithCache();

      const scored = allEntries
        .map((entry, index) => ({ entry, index, score: scoreEntry(entry, request) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map((item) => item.entry);

      return {
        entries: scored as KnowledgeEntry[],
        context: scored.map((entry) => `[${entry.kind}] ${entry.title}：${entry.content}`),
      };
    },
  };
}
