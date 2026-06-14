import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FieldStatItem, TrendDataPoint } from "../services/stats.service";

export interface DashboardStats {
  todayJobs: number;
  needsReview: number;
  completedJobs: number;
  onlineProviders: number;
  totalJobs: number;
  recentAlerts: Array<{
    id: string;
    status: string;
    schemaKey: string;
    createdAt: string;
    [key: string]: unknown;
  }>;
}

export interface StatsRouteService {
  getFieldStats(schemaKey: string, limit?: number): Promise<FieldStatItem[]>;
  getTrendStats(schemaKey: string, days?: number): Promise<TrendDataPoint[]>;
  getDashboardStats(): Promise<DashboardStats>;
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
    "/stats/dashboard",
    { preHandler: authPreHandler },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await service.getDashboardStats();
      return reply.send(stats);
    }
  );

  app.get(
    "/stats/fields",
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { schemaKey?: string; limit?: string };
      if (!query.schemaKey) {
        return reply.send({ stats: [], total: 0 });
      }
      const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 100, 500) : 100;
      try {
        const stats = await service.getFieldStats(query.schemaKey, limit);
        return reply.send({ stats, total: stats.length });
      } catch {
        return reply.send({ stats: [], total: 0 });
      }
    }
  );

  app.get(
    "/stats/trend",
    { preHandler: authPreHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { schemaKey?: string; days?: string };
      if (!query.schemaKey) {
        return reply.send({ trend: [] });
      }
      const days = query.days ? Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 365) : 30;
      try {
        const trend = await service.getTrendStats(query.schemaKey, days);
        return reply.send({ trend });
      } catch {
        return reply.send({ trend: [] });
      }
    }
  );
}
