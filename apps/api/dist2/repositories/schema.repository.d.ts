import type { Prisma, PrismaClient, SchemaDraftStatus, SchemaVersionStatus } from "@prisma/client";
type SchemaRepositoryDependencies = Pick<PrismaClient, "schemaDraft" | "schemaVersion">;
export interface CreateSchemaDraftInput {
    schemaKey: string;
    displayName: string;
    definition: Prisma.InputJsonValue;
    createdById?: string | null;
}
export interface UpdateSchemaDraftValidationInput {
    id: string;
    status: SchemaDraftStatus;
    validationReport: Prisma.InputJsonValue;
}
export interface UpdateSchemaDraftDefinitionInput {
    id: string;
    definition: Prisma.InputJsonValue;
    status: SchemaDraftStatus;
    validationReport: Prisma.InputJsonValue;
}
export interface CreateSchemaVersionInput {
    schemaKey: string;
    version: number;
    displayName: string;
    definition: Prisma.InputJsonValue;
    changelog: string;
    publishedById?: string | null;
    status?: SchemaVersionStatus;
}
/**
 * schema 仓库把草稿和发布版本的持久化集中在一起。
 * 这样后续 schema 在线编辑、校验、发布时可以共享同一套查询与写入入口。
 */
export declare function createSchemaRepository(dependencies: SchemaRepositoryDependencies): {
    createDraft(input: CreateSchemaDraftInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaDraftStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string;
        definition: Prisma.JsonValue;
        validationReport: Prisma.JsonValue;
        publishedVersionId: string | null;
    }>;
    findDraftById(id: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaDraftStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string;
        definition: Prisma.JsonValue;
        validationReport: Prisma.JsonValue;
        publishedVersionId: string | null;
    } | null>;
    updateDraftValidation(input: UpdateSchemaDraftValidationInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaDraftStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string;
        definition: Prisma.JsonValue;
        validationReport: Prisma.JsonValue;
        publishedVersionId: string | null;
    }>;
    updateDraftDefinition(input: UpdateSchemaDraftDefinitionInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaDraftStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string;
        definition: Prisma.JsonValue;
        validationReport: Prisma.JsonValue;
        publishedVersionId: string | null;
    }>;
    markDraftPublished(input: {
        id: string;
        publishedVersionId: string;
    }): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaDraftStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string;
        definition: Prisma.JsonValue;
        validationReport: Prisma.JsonValue;
        publishedVersionId: string | null;
    }>;
    findActiveVersionBySchemaKey(schemaKey: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    } | null>;
    listActive(): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    }[]>;
    listVersions(schemaKey: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    }[]>;
    findVersionById(id: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    } | null>;
    createVersion(input: CreateSchemaVersionInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    }>;
    deactivateActiveVersions(schemaKey: string): Promise<Prisma.BatchPayload>;
    setVersionStatus(input: {
        id: string;
        status: SchemaVersionStatus;
    }): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.SchemaVersionStatus;
        createdAt: Date;
        displayName: string;
        schemaKey: string;
        version: number;
        definition: Prisma.JsonValue;
        changelog: string;
        publishedById: string | null;
        publishedAt: Date;
    }>;
};
export {};
//# sourceMappingURL=schema.repository.d.ts.map