export function createKnowledgeRepository(dependencies) {
    return {
        async list(filter = {}) {
            const where = {};
            if (filter.kind)
                where.kind = filter.kind;
            if (filter.enabled !== undefined)
                where.enabled = filter.enabled;
            if (filter.fieldKey)
                where.fieldKeys = { has: filter.fieldKey };
            if (filter.search) {
                where.OR = [
                    { title: { contains: filter.search, mode: "insensitive" } },
                    { content: { contains: filter.search, mode: "insensitive" } },
                ];
            }
            return dependencies.knowledgeEntry.findMany({
                where,
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            });
        },
        async getById(id) {
            return dependencies.knowledgeEntry.findUnique({ where: { id } });
        },
        async create(input) {
            return dependencies.knowledgeEntry.create({
                data: {
                    kind: input.kind,
                    title: input.title,
                    content: input.content,
                    keywords: input.keywords ?? [],
                    fieldKeys: input.fieldKeys ?? [],
                    enabled: input.enabled ?? true,
                    sortOrder: input.sortOrder ?? 0,
                    createdById: input.createdById ?? null,
                },
            });
        },
        async update(id, input) {
            const data = {};
            if (input.kind !== undefined)
                data.kind = input.kind;
            if (input.title !== undefined)
                data.title = input.title;
            if (input.content !== undefined)
                data.content = input.content;
            if (input.keywords !== undefined)
                data.keywords = input.keywords;
            if (input.fieldKeys !== undefined)
                data.fieldKeys = input.fieldKeys;
            if (input.enabled !== undefined)
                data.enabled = input.enabled;
            if (input.sortOrder !== undefined)
                data.sortOrder = input.sortOrder;
            return dependencies.knowledgeEntry.update({ where: { id }, data });
        },
        async delete(id) {
            await dependencies.knowledgeEntry.delete({ where: { id } });
        },
        async count() {
            return dependencies.knowledgeEntry.count();
        },
        async seedIfEmpty(entries) {
            const count = await dependencies.knowledgeEntry.count();
            if (count > 0)
                return 0;
            await dependencies.knowledgeEntry.createMany({ data: entries });
            return entries.length;
        },
        async getAllEnabled() {
            return dependencies.knowledgeEntry.findMany({
                where: { enabled: true },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            });
        },
    };
}
//# sourceMappingURL=knowledge.repository.js.map