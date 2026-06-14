import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

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

const knowledgeCreateSchema = z.object({
  kind: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  keywords: z.array(z.string().max(200)).max(50).optional(),
  fieldKeys: z.array(z.string().max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strip();

const knowledgeUpdateSchema = z.object({
  kind: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(50000).optional(),
  keywords: z.array(z.string().max(200)).max(50).optional(),
  fieldKeys: z.array(z.string().max(200)).max(50).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strip();

export function registerKnowledgeRoutes(
  app: FastifyInstance,
  service: KnowledgeRouteService,
  authHook?: {
    authenticate: any;
    requirePermission: (permission: string) => any;
  }
) {
  const authPreHandlers = authHook
    ? [authHook.authenticate, authHook.requirePermission("schema:read")]
    : [];

  // GET /knowledge — 列表
  app.get(
    "/knowledge",
    { preHandler: authHook ? [authHook.authenticate] : [] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const entries = await service.knowledgeRepository.list({
        kind: query.kind,
        enabled: query.enabled !== undefined ? query.enabled === "true" : undefined,
        fieldKey: query.fieldKey,
        search: query.search,
      });
      return reply.send({ entries, total: entries.length });
    }
  );

  // GET /knowledge/:id — 详情
  app.get(
    "/knowledge/:id",
    { preHandler: authHook ? [authHook.authenticate] : [] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const entry = await service.knowledgeRepository.getById(id);
      if (!entry) return reply.status(404).send({ error: "NOT_FOUND" });
      return reply.send(entry);
    }
  );

  // POST /knowledge — 创建
  app.post(
    "/knowledge",
    { preHandler: authPreHandlers },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = knowledgeCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid knowledge entry payload",
          details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const entry = await service.knowledgeRepository.create(parsed.data);
      return reply.status(201).send(entry);
    }
  );

  // PUT /knowledge/:id — 更新
  app.put(
    "/knowledge/:id",
    { preHandler: authPreHandlers },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const parsed = knowledgeUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid knowledge entry payload",
          details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      try {
        const entry = await service.knowledgeRepository.update(id, parsed.data);
        return reply.send(entry);
      } catch (error: any) {
        if (error?.code === "P2025") {
          return reply.status(404).send({ error: "NOT_FOUND" });
        }
        throw error;
      }
    }
  );

  // DELETE /knowledge/:id — 删除
  app.delete(
    "/knowledge/:id",
    { preHandler: authPreHandlers },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      try {
        await service.knowledgeRepository.delete(id);
        return reply.status(204).send();
      } catch (error: any) {
        if (error?.code === "P2025") {
          return reply.status(404).send({ error: "NOT_FOUND" });
        }
        throw error;
      }
    }
  );
}
