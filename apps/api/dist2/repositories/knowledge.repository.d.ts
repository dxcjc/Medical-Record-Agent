import type { PrismaClient, KnowledgeEntryKind } from "@prisma/client";
type KnowledgeRepositoryDependencies = Pick<PrismaClient, "knowledgeEntry">;
export interface CreateKnowledgeEntryInput {
    kind: KnowledgeEntryKind;
    title: string;
    content: string;
    keywords?: string[];
    fieldKeys?: string[];
    enabled?: boolean;
    sortOrder?: number;
    createdById?: string;
}
export interface UpdateKnowledgeEntryInput {
    kind?: KnowledgeEntryKind;
    title?: string;
    content?: string;
    keywords?: string[];
    fieldKeys?: string[];
    enabled?: boolean;
    sortOrder?: number;
}
export interface ListKnowledgeEntriesFilter {
    kind?: KnowledgeEntryKind;
    enabled?: boolean;
    fieldKey?: string;
    search?: string;
}
export declare function createKnowledgeRepository(dependencies: KnowledgeRepositoryDependencies): {
    list(filter?: ListKnowledgeEntriesFilter): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        kind: import("@prisma/client").$Enums.KnowledgeEntryKind;
        enabled: boolean;
        content: string;
        title: string;
        keywords: string[];
        fieldKeys: string[];
        sortOrder: number;
    }[]>;
    getById(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        kind: import("@prisma/client").$Enums.KnowledgeEntryKind;
        enabled: boolean;
        content: string;
        title: string;
        keywords: string[];
        fieldKeys: string[];
        sortOrder: number;
    } | null>;
    create(input: CreateKnowledgeEntryInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        kind: import("@prisma/client").$Enums.KnowledgeEntryKind;
        enabled: boolean;
        content: string;
        title: string;
        keywords: string[];
        fieldKeys: string[];
        sortOrder: number;
    }>;
    update(id: string, input: UpdateKnowledgeEntryInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        kind: import("@prisma/client").$Enums.KnowledgeEntryKind;
        enabled: boolean;
        content: string;
        title: string;
        keywords: string[];
        fieldKeys: string[];
        sortOrder: number;
    }>;
    delete(id: string): Promise<void>;
    count(): Promise<number>;
    seedIfEmpty(entries: CreateKnowledgeEntryInput[]): Promise<number>;
    getAllEnabled(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        kind: import("@prisma/client").$Enums.KnowledgeEntryKind;
        enabled: boolean;
        content: string;
        title: string;
        keywords: string[];
        fieldKeys: string[];
        sortOrder: number;
    }[]>;
};
export {};
//# sourceMappingURL=knowledge.repository.d.ts.map