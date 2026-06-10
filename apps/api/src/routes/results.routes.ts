import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { assertRouteResponseObject, type ApiRouteResponseObject } from "./route-dtos";

export interface ResultRouteService {
  getByJobId(jobId: string): Promise<ApiRouteResponseObject | null>;
}

export interface ResultRoutesDependencies {
  resultService: ResultRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
}

function sendNotFound() {
  return {
    error: "NOT_FOUND"
  };
}

/**
 * 注册识别结果路由。
 * 结果可能包含病历结构化字段和证据片段，因此必须通过 job:read 权限保护。
 */
export async function registerResultRoutes(server: FastifyInstance, dependencies: ResultRoutesDependencies) {
  server.get(
    "/results/:jobId",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "result.view",
                objectType: "job",
                objectId: (request) => (request.params as { jobId?: string }).jobId
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { jobId: string };
      const result = await dependencies.resultService.getByJobId(params.jobId);

      if (!result) {
        return reply.status(404).send(sendNotFound());
      }

      return assertRouteResponseObject(result, "RESULT_RESPONSE_INVALID");
    }
  );
}
