import type { Prisma, SchemaDraftStatus, SchemaVersionStatus } from "@prisma/client";
import type { AuditRecordInput } from "../middleware/audit.middleware";
import type { AuthContext } from "../middleware/auth.middleware";
import type { ApiRouteResponseObject } from "../routes/route-dtos";
export interface SchemaValidationResult {
    valid: boolean;
    errors: Array<{
        code: string;
        path: string;
        message: string;
    }>;
}
export interface SchemaVersionSnapshot extends ApiRouteResponseObject {
    id: string;
    schemaKey: string;
    version: number;
    displayName?: string;
    definition: unknown;
    status: SchemaVersionStatus | string;
}
export interface SchemaDraftSnapshot extends ApiRouteResponseObject {
    id: string;
    schemaKey: string;
    displayName: string;
    definition: unknown;
    status: SchemaDraftStatus | string;
}
export interface SchemaServiceRepository {
    createDraft(input: {
        schemaKey: string;
        displayName: string;
        definition: Prisma.InputJsonValue;
        createdById?: string | null;
    }): Promise<ApiRouteResponseObject>;
    findDraftById(id: string): Promise<SchemaDraftSnapshot | null>;
    updateDraftDefinition(input: {
        id: string;
        definition: Prisma.InputJsonValue;
        status: SchemaDraftStatus;
        validationReport: Prisma.InputJsonValue;
    }): Promise<ApiRouteResponseObject>;
    updateDraftValidation(input: {
        id: string;
        status: SchemaDraftStatus;
        validationReport: Prisma.InputJsonValue;
    }): Promise<ApiRouteResponseObject>;
    findActiveVersionBySchemaKey(schemaKey: string): Promise<SchemaVersionSnapshot | null>;
    listVersions(schemaKey: string): Promise<SchemaVersionSnapshot[]>;
    createVersion(input: {
        schemaKey: string;
        version: number;
        displayName: string;
        definition: Prisma.InputJsonValue;
        changelog: string;
        publishedById?: string | null;
        status?: SchemaVersionStatus;
    }): Promise<SchemaVersionSnapshot>;
    deactivateActiveVersions(schemaKey: string): Promise<unknown>;
    markDraftPublished(input: {
        id: string;
        publishedVersionId: string;
    }): Promise<unknown>;
    setVersionStatus(input: {
        id: string;
        status: SchemaVersionStatus;
    }): Promise<ApiRouteResponseObject>;
    findVersionById(id: string): Promise<SchemaVersionSnapshot | null>;
}
export interface CreateSchemaServiceOptions {
    repository: SchemaServiceRepository;
    audit: (input: AuditRecordInput) => Promise<unknown>;
    validateSchema?: (input: unknown) => SchemaValidationResult;
    now?: () => Date;
}
export declare class SchemaServiceError extends Error {
    readonly code: "FORBIDDEN" | "SCHEMA_DRAFT_NOT_FOUND" | "SCHEMA_VERSION_NOT_FOUND" | "SCHEMA_DRAFT_INVALID";
    readonly statusCode: number;
    constructor(code: SchemaServiceError["code"], statusCode: number);
}
export declare function createSchemaService(options: CreateSchemaServiceOptions): {
    createDraft(input: {
        schemaKey: string;
        displayName: string;
        definition: unknown;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    updateDraft(input: {
        id: string;
        definition: unknown;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    validateDraft(input: {
        id: string;
        definition: unknown;
        actor: AuthContext;
    }): Promise<{
        valid: boolean;
        errors: Array<{
            code: string;
            path: string;
            message: string;
        }>;
    }>;
    publishDraft(input: {
        id: string;
        changelog: string;
        actor: AuthContext;
    }): Promise<SchemaVersionSnapshot>;
    rollbackVersion(input: {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    deactivateVersion(input: {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    compareVersions(input: {
        schemaKey: string;
        leftVersionId: string;
        rightVersionId: string;
        actor: AuthContext;
    }): Promise<{
        schemaKey: string;
        changedVersion: {
            left: number;
            right: number;
        };
        fields: {
            added: string[];
            removed: string[];
            unchanged: string[];
        };
    }>;
};
//# sourceMappingURL=schema.service.d.ts.map