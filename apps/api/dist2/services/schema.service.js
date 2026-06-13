import { PERMISSIONS } from "../auth/permissions";
export class SchemaServiceError extends Error {
    code;
    statusCode;
    constructor(code, statusCode) {
        super(code);
        this.name = "SchemaServiceError";
        this.code = code;
        this.statusCode = statusCode;
    }
}
function requirePermission(actor, permission) {
    if (!actor.permissions.includes(permission)) {
        throw new SchemaServiceError("FORBIDDEN", 403);
    }
}
function toInputJsonValue(value) {
    return value;
}
function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function defaultValidateSchema(input) {
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
    const errors = [];
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
function changedFieldKeys(left, right) {
    const leftDefinition = isRecord(left.definition) ? left.definition : {};
    const rightDefinition = isRecord(right.definition) ? right.definition : {};
    const leftFields = Array.isArray(leftDefinition.fields)
        ? leftDefinition.fields
        : [];
    const rightFields = Array.isArray(rightDefinition.fields)
        ? rightDefinition.fields
        : [];
    const leftKeys = new Set(leftFields.map((field) => field.key).filter((key) => typeof key === "string"));
    const rightKeys = new Set(rightFields.map((field) => field.key).filter((key) => typeof key === "string"));
    return {
        added: Array.from(rightKeys).filter((key) => !leftKeys.has(key)),
        removed: Array.from(leftKeys).filter((key) => !rightKeys.has(key)),
        unchanged: Array.from(leftKeys).filter((key) => rightKeys.has(key))
    };
}
export function createSchemaService(options) {
    const now = options.now ?? (() => new Date());
    const validateSchema = options.validateSchema ?? defaultValidateSchema;
    async function recordAudit(input) {
        await options.audit({
            result: input.result ?? "success",
            ...input
        });
    }
    return {
        createDraft(input) {
            requirePermission(input.actor, PERMISSIONS.schemaDraft);
            return options.repository.createDraft({
                schemaKey: input.schemaKey,
                displayName: input.displayName,
                definition: toInputJsonValue(input.definition),
                createdById: input.actor.actorUserId
            });
        },
        updateDraft(input) {
            requirePermission(input.actor, PERMISSIONS.schemaDraft);
            return options.repository.updateDraftDefinition({
                id: input.id,
                definition: toInputJsonValue(input.definition),
                status: "draft",
                validationReport: {}
            });
        },
        async validateDraft(input) {
            requirePermission(input.actor, PERMISSIONS.schemaDraft);
            const validation = validateSchema(input.definition);
            await options.repository.updateDraftValidation({
                id: input.id,
                status: validation.valid ? "ready" : "invalid",
                validationReport: validation
            });
            return { ...validation };
        },
        async publishDraft(input) {
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
                    validationReport: validation
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
        async rollbackVersion(input) {
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
        async deactivateVersion(input) {
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
        async compareVersions(input) {
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
//# sourceMappingURL=schema.service.js.map