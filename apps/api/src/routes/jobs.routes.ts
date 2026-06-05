import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";

export interface JobRouteService {
  create(input: unknown): Promise<unknown>;
  get(id: string): Promise<unknown | null>;
}

export interface JobRoutesDependencies {
  jobService: JobRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
}

function sendNotFound() {
  return {
    error: "NOT_FOUND"
  };
}

/**
 * 注册识别任务路由。
 * 创建任务需要 job:create，查看任务需要 job:read，调用方系统可用 JWT 或 API token 进入同一鉴权链路。
 */
export async function registerJobRoutes(server: FastifyInstance, dependencies: JobRoutesDependencies) {
  server.post(
    "/jobs",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobCreate)
      ]
    },
    async (request) => dependencies.jobService.create(request.body)
  );

  server.get(
    "/jobs/:id",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const job = await dependencies.jobService.get(params.id);

      if (!job) {
        return reply.status(404).send(sendNotFound());
      }

      return job;
    }
  );
}
