import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface KnowledgeRouteService {
  knowledgeRepository: {
    list(filter: any): Promise<any[]>;
    getById(id: string): Promise<any>;
    create(input: any): Promise<any>;
    update(id: string, input: any): Promise<any>;
    delete(id: string): Promise<void>;
    count(): Promise<number>;
  };
}

export function registerKnowledgeRoutes(
  app: FastifyInstance,
  service: KnowledgeRouteService,
  authHook?: any
) {
  // GET /knowledge — 列表
  app.get("/knowledge", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const entries = await service.knowledgeRepository.list({
      kind: query.kind,
      enabled: query.enabled !== undefined ? query.enabled === "true" : undefined,
      fieldKey: query.fieldKey,
      search: query.search,
    });
    return reply.send({ entries, total: entries.length });
  });

  // GET /knowledge/:id — 详情
  app.get("/knowledge/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const entry = await service.knowledgeRepository.getById(id);
    if (!entry) return reply.status(404).send({ error: "NOT_FOUND" });
    return reply.send(entry);
  });

  // POST /knowledge — 创建
  app.post("/knowledge", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body.kind || !body.title || !body.content) {
      return reply.status(400).send({ error: "MISSING_FIELDS", message: "kind, title, content 必填" });
    }
    const entry = await service.knowledgeRepository.create(body);
    return reply.status(201).send(entry);
  });

  // PUT /knowledge/:id — 更新
  app.put("/knowledge/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const body = request.body as any;
    try {
      const entry = await service.knowledgeRepository.update(id, body);
      return reply.send(entry);
    } catch {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }
  });

  // DELETE /knowledge/:id — 删除
  app.delete("/knowledge/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    try {
      await service.knowledgeRepository.delete(id);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }
  });
}
