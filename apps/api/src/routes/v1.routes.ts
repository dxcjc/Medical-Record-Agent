import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import { assertRouteResponseObject, type ApiRouteResponseObject } from "./route-dtos";

export interface V1JobListItem {
  id: string;
  status: string;
  schemaKey: string;
  schemaDisplayName?: string | undefined;
  createdAt: string;
  updatedAt: string;
  sourceFileId?: string | undefined;
}

export interface V1JobsListResponse {
  items: V1JobListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface V1RouteService {
  listJobs(input: {
    page: number;
    pageSize: number;
    status?: string;
    schemaKey?: string;
    search?: string;
  }): Promise<V1JobsListResponse>;
  getJobResult(jobId: string): Promise<ApiRouteResponseObject | null>;
  getJobResultFields(jobId: string): Promise<{ fields: Record<string, unknown> } | null>;
}

export interface V1RoutesDependencies {
  v1Service: V1RouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
}

function sendNotFound() {
  return {
    error: "NOT_FOUND"
  };
}

/**
 * 注册 v1 推送 API 路由。
 * 面向外部系统集成，返回标准化的任务列表和识别结果。
 */
export async function registerV1Routes(server: FastifyInstance, dependencies: V1RoutesDependencies) {
  server.get(
    "/v1/jobs",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request) => {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
        schemaKey?: string;
        search?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const params: {
        page: number;
        pageSize: number;
        status?: string;
        schemaKey?: string;
        search?: string;
      } = { page, pageSize };
      if (query.status) params.status = query.status;
      if (query.schemaKey) params.schemaKey = query.schemaKey;
      if (query.search) params.search = query.search;
      return dependencies.v1Service.listJobs(params);
    }
  );

  server.get(
    "/v1/jobs/:id/result",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const result = await dependencies.v1Service.getJobResult(params.id);

      if (!result) {
        return reply.status(404).send(sendNotFound());
      }

      return assertRouteResponseObject(result, "V1_RESULT_RESPONSE_INVALID");
    }
  );

  server.get(
    "/v1/jobs/:id/result/fields",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const result = await dependencies.v1Service.getJobResultFields(params.id);

      if (!result) {
        return reply.status(404).send(sendNotFound());
      }

      return result;
    }
  );
}
