import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FieldStatItem } from "../services/stats.service";

export interface StatsRouteService {
  getFieldStats(schemaKey: string, limit?: number): Promise<FieldStatItem[]>;
}

export function registerStatsRoutes(
  app: FastifyInstance,
  service: StatsRouteService
) {
  app.get("/api/stats/fields", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { schemaKey?: string; limit?: string };
    if (!query.schemaKey) {
      return reply.status(400).send({ error: "MISSING_PARAM", message: "schemaKey is required" });
    }
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 100, 500) : 100;
    const stats = await service.getFieldStats(query.schemaKey, limit);
    return reply.send({ stats, total: stats.length });
  });
}
