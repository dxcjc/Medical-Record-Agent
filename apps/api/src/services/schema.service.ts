import type { Prisma, SchemaDraftStatus, SchemaVersionStatus } from "@prisma/client";

import { PERMISSIONS } from "../auth/permissions";
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
  markDraftPublished(input: { id: string; publishedVersionId: string }): Promise<unknown>;
  setVersionStatus(input: { id: string; status: SchemaVersionStatus }): Promise<ApiRouteResponseObject>;
  findVersionById(id: string): Promise<SchemaVersionSnapshot | null>;
}

export interface CreateSchemaServiceOptions {
  repository: SchemaServiceRepository;
  audit: (input: AuditRecordInput) => Promise<unknown>;
  validateSchema?: (input: unknown) => SchemaValidationResult;
  now?: () => Date;
}

export class SchemaServiceError extends Error {
  readonly code: "FORBIDDEN" | "SCHEMA_DRAFT_NOT_FOUND" | "SCHEMA_VERSION_NOT_FOUND" | "SCHEMA_DRAFT_INVALID";
  readonly statusCode: number;

  constructor(code: SchemaServiceError["code"], statusCode: number) {
    super(code);
    this.name = "SchemaServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function requirePermission(actor: AuthContext, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new SchemaServiceError("FORBIDDEN", 403);
  }
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function defaultValidateSchema(input: unknown): SchemaValidationResult {
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        {
          code: "INVALID_SCHEMA",
          path: "schema",
          message: "Schema 草稿必须是 JSON 对象。"
        }
      ]
    };
  }

  const errors: SchemaValidationResult["errors"] = [];
  if (typeof input.key !== "string" || input.key.trim().length === 0) {
    errors.push({ code: "MISSING_SCHEMA_KEY", path: "key", message: "Schema 缺少 key。" });
  }
  if (typeof input.label !== "string" || input.label.trim().length === 0) {
    errors.push({ code: "MISSING_SCHEMA_LABEL", path: "label", message: "Schema 缺少 label。" });
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    errors.push({ code: "INVALID_FIELDS", path: "fields", message: "Schema fields 必须是非空数组。" });
  }
  const evidencePolicy = isRecord(input.evidencePolicy) ? input.evidencePolicy : undefined;
  if (!evidencePolicy || typeof evidencePolicy.minConfidence !== "number" || evidencePolicy.minConfidence < 0 || evidencePolicy.minConfidence > 1) {
    errors.push({
      code: "INVALID_MIN_CONFIDENCE",
      path: "evidencePolicy.minConfidence",
      message: "evidencePolicy.minConfidence 必须是 0 到 1 之间的数字。"
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function changedFieldKeys(left: SchemaVersionSnapshot, right: SchemaVersionSnapshot) {
  const leftDefinition = isRecord(left.definition) ? left.definition : {};
  const rightDefinition = isRecord(right.definition) ? right.definition : {};
  const leftFields = Array.isArray(leftDefinition.fields)
    ? (leftDefinition.fields as Array<{ key?: unknown }>)
    : [];
  const rightFields = Array.isArray(rightDefinition.fields)
    ? (rightDefinition.fields as Array<{ key?: unknown }>)
    : [];
  const leftKeys = new Set(leftFields.map((field) => field.key).filter((key): key is string => typeof key === "string"));
  const rightKeys = new Set(rightFields.map((field) => field.key).filter((key): key is string => typeof key === "string"));

  return {
    added: Array.from(rightKeys).filter((key) => !leftKeys.has(key)),
    removed: Array.from(leftKeys).filter((key) => !rightKeys.has(key)),
    unchanged: Array.from(leftKeys).filter((key) => rightKeys.has(key))
  };
}

export function createSchemaService(options: CreateSchemaServiceOptions) {
  const now = options.now ?? (() => new Date());
  const validateSchema = options.validateSchema ?? defaultValidateSchema;

  async function recordAudit(input: Omit<AuditRecordInput, "result"> & { result?: AuditRecordInput["result"] }) {
    await options.audit({
      result: input.result ?? "success",
      ...input
    });
  }

  return {
    createDraft(input: {
      schemaKey: string;
      displayName: string;
      definition: unknown;
      actor: AuthContext;
    }) {
      requirePermission(input.actor, PERMISSIONS.schemaDraft);

      return options.repository.createDraft({
        schemaKey: input.schemaKey,
        displayName: input.displayName,
        definition: toInputJsonValue(input.definition),
        createdById: input.actor.actorUserId
      });
    },

    updateDraft(input: { id: string; definition: unknown; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaDraft);

      return options.repository.updateDraftDefinition({
        id: input.id,
        definition: toInputJsonValue(input.definition),
        status: "draft",
        validationReport: {}
      });
    },

    async validateDraft(input: { id: string; definition: unknown; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaDraft);

      const validation = validateSchema(input.definition);
      await options.repository.updateDraftValidation({
        id: input.id,
        status: validation.valid ? "ready" : "invalid",
        validationReport: validation as unknown as Prisma.InputJsonValue
      });

      return { ...validation };
    },

    async publishDraft(input: { id: string; changelog: string; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaPublish);

      const draft = await options.repository.findDraftById(input.id);
      if (!draft) {
        throw new SchemaServiceError("SCHEMA_DRAFT_NOT_FOUND", 404);
      }

      const validation = validateSchema(draft.definition);
      if (!validation.valid || draft.status !== "ready") {
        await options.repository.updateDraftValidation({
          id: draft.id,
          status: "invalid",
          validationReport: validation as unknown as Prisma.InputJsonValue
        });
        throw new SchemaServiceError("SCHEMA_DRAFT_INVALID", 409);
      }

      const activeVersion = await options.repository.findActiveVersionBySchemaKey(draft.schemaKey);
      const nextVersion = (activeVersion?.version ?? 0) + 1;
      await options.repository.deactivateActiveVersions(draft.schemaKey);
      const version = await options.repository.createVersion({
        schemaKey: draft.schemaKey,
        version: nextVersion,
        displayName: draft.displayName,
        definition: toInputJsonValue(draft.definition),
        changelog: input.changelog,
        publishedById: input.actor.actorUserId,
        status: "active"
      });
      await options.repository.markDraftPublished({
        id: draft.id,
        publishedVersionId: version.id
      });
      await recordAudit({
        actorUserId: input.actor.actorUserId,
        action: "schema.publish",
        objectType: "schema",
        objectId: version.id,
        metadata: {
          schemaKey: draft.schemaKey,
          version: nextVersion,
          at: now().toISOString()
        }
      });

      return version;
    },

    async rollbackVersion(input: { id: string; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaPublish);

      const version = await options.repository.findVersionById(input.id);
      if (!version) {
        throw new SchemaServiceError("SCHEMA_VERSION_NOT_FOUND", 404);
      }

      await options.repository.deactivateActiveVersions(version.schemaKey);
      const activated = await options.repository.setVersionStatus({
        id: version.id,
        status: "active"
      });
      await recordAudit({
        actorUserId: input.actor.actorUserId,
        action: "schema.rollback",
        objectType: "schema",
        objectId: version.id,
        metadata: {
          schemaKey: version.schemaKey,
          version: version.version,
          at: now().toISOString()
        }
      });

      return activated;
    },

    async deactivateVersion(input: { id: string; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaPublish);

      const deactivated = await options.repository.setVersionStatus({
        id: input.id,
        status: "inactive"
      });
      await recordAudit({
        actorUserId: input.actor.actorUserId,
        action: "schema.deactivate",
        objectType: "schema",
        objectId: input.id,
        metadata: {
          at: now().toISOString()
        }
      });

      return deactivated;
    },

    async activateVersion(input: { id: string; actor: AuthContext }) {
      requirePermission(input.actor, PERMISSIONS.schemaPublish);

      const version = await options.repository.findVersionById(input.id);
      if (!version) {
        throw new SchemaServiceError("SCHEMA_VERSION_NOT_FOUND", 404);
      }

      // Deactivate all active versions for this schemaKey
      await options.repository.deactivateActiveVersions(version.schemaKey);
      // Activate the target version
      const activated = await options.repository.setVersionStatus({
        id: version.id,
        status: "active"
      });
      await recordAudit({
        actorUserId: input.actor.actorUserId,
        action: "schema.activate",
        objectType: "schema",
        objectId: version.id,
        metadata: {
          schemaKey: version.schemaKey,
          version: version.version,
          at: now().toISOString()
        }
      });

      return activated;
    },

    async compareVersions(input: {
      schemaKey: string;
      leftVersionId: string;
      rightVersionId: string;
      actor: AuthContext;
    }) {
      requirePermission(input.actor, PERMISSIONS.schemaDraft);

      const [left, right] = await Promise.all([
        options.repository.findVersionById(input.leftVersionId),
        options.repository.findVersionById(input.rightVersionId)
      ]);
      if (!left || !right) {
        throw new SchemaServiceError("SCHEMA_VERSION_NOT_FOUND", 404);
      }

      return {
        schemaKey: input.schemaKey,
        changedVersion: {
          left: left.version,
          right: right.version
        },
        fields: changedFieldKeys(left, right)
      };
    }
  };
}
