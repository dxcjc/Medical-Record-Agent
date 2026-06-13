export function registerKnowledgeRoutes(app, service, authHook) {
    // GET /knowledge — 列表
    app.get("/knowledge", async (request, reply) => {
        const query = request.query;
        const entries = await service.knowledgeRepository.list({
            kind: query.kind,
            enabled: query.enabled !== undefined ? query.enabled === "true" : undefined,
            fieldKey: query.fieldKey,
            search: query.search,
        });
        return reply.send({ entries, total: entries.length });
    });
    // GET /knowledge/:id — 详情
    app.get("/knowledge/:id", async (request, reply) => {
        const { id } = request.params;
        const entry = await service.knowledgeRepository.getById(id);
        if (!entry)
            return reply.status(404).send({ error: "NOT_FOUND" });
        return reply.send(entry);
    });
    // POST /knowledge — 创建
    app.post("/knowledge", async (request, reply) => {
        const body = request.body;
        if (!body.kind || !body.title || !body.content) {
            return reply.status(400).send({ error: "MISSING_FIELDS", message: "kind, title, content 必填" });
        }
        const entry = await service.knowledgeRepository.create(body);
        return reply.status(201).send(entry);
    });
    // PUT /knowledge/:id — 更新
    app.put("/knowledge/:id", async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            const entry = await service.knowledgeRepository.update(id, body);
            return reply.send(entry);
        }
        catch {
            return reply.status(404).send({ error: "NOT_FOUND" });
        }
    });
    // DELETE /knowledge/:id — 删除
    app.delete("/knowledge/:id", async (request, reply) => {
        const { id } = request.params;
        try {
            await service.knowledgeRepository.delete(id);
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: "NOT_FOUND" });
        }
    });
}
//# sourceMappingURL=knowledge.routes.js.map