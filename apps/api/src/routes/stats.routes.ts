import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FieldStatItem, TrendDataPoint } from "../services/stats.service";

export interface StatsRouteService {
  getFieldStats(schemaKey: string, limit?: number): Promise<FieldStatItem[]>;
  getTrendStats(schemaKey: string, days?: number): Promise<TrendDataPoint[]>;
}

export function registerStatsRoutes(
  app: FastifyInstance,
  service: StatsRouteService,
  authHook?: {
    authenticate: any;
    requirePermission: (permission: string) => any;
  }
) {
  const authPreHandler = authHook ? [authHook.authenticate] : [];

  app.get(
    "/api/stats/fields",
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { schemaKey?: string; limit?: string };
      if (!query.schemaKey) {
        return reply.status(400).send({ error: "MISSING_PARAM", message: "schemaKey is required" });
      }
      const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 100, 500) : 100;
      const stats = await service.getFieldStats(query.schemaKey, limit);
      return reply.send({ stats, total: stats.length });
    }
  );

  app.get(
    "/api/stats/trend",
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { schemaKey?: string; days?: string };
      if (!query.schemaKey) {
        return reply.status(400).send({ error: "MISSING_PARAM", message: "schemaKey is required" });
      }
      const days = query.days ? Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 365) : 30;
      const trend = await service.getTrendStats(query.schemaKey, days);
      return reply.send({ trend });
    }
  );
}
