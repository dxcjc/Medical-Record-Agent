/**
 * schema 仓库把草稿和发布版本的持久化集中在一起。
 * 这样后续 schema 在线编辑、校验、发布时可以共享同一套查询与写入入口。
 */
export function createSchemaRepository(dependencies) {
    return {
        async createDraft(input) {
            return dependencies.schemaDraft.create({
                data: {
                    schemaKey: input.schemaKey,
                    displayName: input.displayName,
                    definition: input.definition,
                    createdById: input.createdById ?? null,
                    status: "draft",
                    validationReport: {}
                }
            });
        },
        async findDraftById(id) {
            return dependencies.schemaDraft.findUnique({
                where: { id }
            });
        },
        async updateDraftValidation(input) {
            return dependencies.schemaDraft.update({
                where: { id: input.id },
                data: {
                    status: input.status,
                    validationReport: input.validationReport
                }
            });
        },
        async updateDraftDefinition(input) {
            return dependencies.schemaDraft.update({
                where: { id: input.id },
                data: {
                    definition: input.definition,
                    status: input.status,
                    validationReport: input.validationReport
                }
            });
        },
        async markDraftPublished(input) {
            return dependencies.schemaDraft.update({
                where: { id: input.id },
                data: {
                    status: "published",
                    publishedVersionId: input.publishedVersionId
                }
            });
        },
        async findActiveVersionBySchemaKey(schemaKey) {
            return dependencies.schemaVersion.findFirst({
                where: {
                    schemaKey,
                    status: "active"
                },
                orderBy: {
                    version: "desc"
                }
            });
        },
        async listActive() {
            return dependencies.schemaVersion.findMany({
                where: {
                    status: "active"
                },
                orderBy: [
                    {
                        schemaKey: "asc"
                    },
                    {
                        version: "desc"
                    }
                ]
            });
        },
        async listVersions(schemaKey) {
            return dependencies.schemaVersion.findMany({
                where: { schemaKey },
                orderBy: {
                    version: "desc"
                }
            });
        },
        async findVersionById(id) {
            return dependencies.schemaVersion.findUnique({
                where: { id }
            });
        },
        async createVersion(input) {
            return dependencies.schemaVersion.create({
                data: {
                    schemaKey: input.schemaKey,
                    version: input.version,
                    displayName: input.displayName,
                    status: input.status ?? "active",
                    definition: input.definition,
                    changelog: input.changelog,
                    publishedById: input.publishedById ?? null
                }
            });
        },
        async deactivateActiveVersions(schemaKey) {
            return dependencies.schemaVersion.updateMany({
                where: {
                    schemaKey,
                    status: "active"
                },
                data: {
                    status: "inactive"
                }
            });
        },
        async setVersionStatus(input) {
            return dependencies.schemaVersion.update({
                where: { id: input.id },
                data: {
                    status: input.status
                }
            });
        }
    };
}
//# sourceMappingURL=schema.repository.js.map