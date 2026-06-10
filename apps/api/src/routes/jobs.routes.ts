import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import {
  assertRouteResponseObject,
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
};

export interface JobRouteService {
  create(input: CreateRecognitionJobServiceInput): Promise<ApiRouteResponseObject>;
  get(id: string): Promise<ApiRouteResponseObject | null>;
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
}
