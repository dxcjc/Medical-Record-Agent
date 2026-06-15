import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import {
  assertRouteResponseObject,
  jobListQuerySchema,
  recognitionJobRouteInputSchema,
  type ApiRouteResponseObject,
  type CreateRecognitionJobRouteInput
} from "./route-dtos";

export interface RecognitionJobDocumentServiceInput {
  documentId: string;
  fileName?: string | undefined;
  mimeType?: string | undefined;
  storageKey?: string | undefined;
  content?: Uint8Array;
}

export type CreateRecognitionJobServiceInput = Omit<CreateRecognitionJobRouteInput, "document"> & {
  document?: RecognitionJobDocumentServiceInput | undefined;
  documents?: RecognitionJobDocumentServiceInput[] | undefined;
};

export interface JobRouteService {
  create(input: CreateRecognitionJobServiceInput): Promise<ApiRouteResponseObject>;
  get(id: string): Promise<ApiRouteResponseObject | null>;
  list(limit?: number): Promise<ApiRouteResponseObject[]>;
  listPaginated?(input: {
    page: number;
    pageSize: number;
    status?: string;
    schemaKey?: string;
    search?: string;
  }): Promise<{ items: ApiRouteResponseObject[]; total: number; page: number; pageSize: number }>;
  softDelete(id: string): Promise<ApiRouteResponseObject>;
  rerun(id: string): Promise<ApiRouteResponseObject>;
  export?(id: string): Promise<ApiRouteResponseObject | null>;
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
    async (request, reply) => {
      const parsed = recognitionJobRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid recognition job payload"
        });
      }

      const job = await dependencies.jobService.create(parsed.data);

      return assertRouteResponseObject(job, "JOB_CREATE_RESPONSE_INVALID");
    }
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

      return assertRouteResponseObject(job, "JOB_RESPONSE_INVALID");
    }
  );

  server.get(
    "/jobs",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request, reply) => {
      const parsed = jobListQuerySchema.safeParse(request.query);
      const data = parsed.success ? parsed.data : {};

      // 如果有分页参数且 service 支持 listPaginated，使用分页模式
      if ((data.page || data.pageSize || data.status || data.schemaKey || data.search) && dependencies.jobService.listPaginated) {
        const result = await dependencies.jobService.listPaginated({
          page: data.page ?? 1,
          pageSize: data.pageSize ?? 20,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.schemaKey !== undefined ? { schemaKey: data.schemaKey } : {}),
          ...(data.search !== undefined ? { search: data.search } : {}),
        });
        return {
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        };
      }

      // 向后兼容：无分页参数时返回 limit 行为
      const limit = data.pageSize ?? 200;
      const jobs = await dependencies.jobService.list(limit);
      return { items: jobs };
    }
  );

  server.delete(
    "/jobs/:id",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobCreate)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const result = await dependencies.jobService.softDelete(params.id);
      return reply.status(200).send(result);
    }
  );

  server.post(
    "/jobs/:id/rerun",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobCreate)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const result = await dependencies.jobService.rerun(params.id);
      return reply.status(201).send(result);
    }
  );

  // GET /jobs/:id/export — 导出任务识别结果
  server.get(
    "/jobs/:id/export",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
      ]
    },
    async (request, reply) => {
      if (!dependencies.jobService.export) {
        return reply.status(501).send({ error: "NOT_IMPLEMENTED", message: "Export not supported" });
      }

      const params = request.params as { id: string };
      const result = await dependencies.jobService.export(params.id);

      if (!result) {
        return reply.status(404).send(sendNotFound());
      }

      return result;
    }
  );
}
