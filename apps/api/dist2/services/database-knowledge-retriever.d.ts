import type { KnowledgeRetriever } from "@medical-record-agent/core";
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
/**
 * 数据库驱动的知识检索器。
 * 每次检索从数据库读取启用的条目，用与 InMemoryKnowledgeRetriever 相同的评分算法排序。
 * 条目变更后无需重启服务即可生效。
 */
export declare function createDatabaseKnowledgeRetriever(repository: KnowledgeRepositoryLike): KnowledgeRetriever;
export {};
//# sourceMappingURL=database-knowledge-retriever.d.ts.map