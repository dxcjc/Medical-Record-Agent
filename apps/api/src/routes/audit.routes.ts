import type { FastifyInstance } from "fastify";

import type { AuthHooksDependencies } from "../middleware/auth.middleware";
import {
  type ApiRouteResponseObject,
  assertRouteResponseObjectList,
  auditListQuerySchema,
  redactSensitiveRouteValue
} from "./route-dtos";

export interface AuditListInput {
  actorUserId?: string;
  actorApiTokenId?: string;
  action?: string;
  take?: number;
}

export interface AuditRouteService {
  listRecent(input: AuditListInput): Promise<ApiRouteResponseObject[]>;
}

export interface AuditRoutesDependencies {
  auditService: AuditRouteService;
  authHooks: ReturnType<typeof import("../middleware/auth.middleware").createAuthHooks>;
}

/**
 * 注册审计查询路由。
 * 审计列表属于敏感运维数据，必须先认证，再显式检查 audit:read 权限。
 */
export async function registerAuditRoutes(server: FastifyInstance, dependencies: AuditRoutesDependencies) {
  server.get(
    "/audit",
    {
      preHandler: [dependencies.authHooks.authenticate, dependencies.authHooks.requirePermission("audit:read")]
    },
    async (request, reply) => {
      const parsed = auditListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid audit query"
        });
      }

      const query = parsed.data;
      const input: AuditListInput = {};

      if (query.take !== undefined) {
        input.take = query.take;
      }

      if (query.action !== undefined) {
        input.action = query.action;
      }

      if (query.actorUserId !== undefined) {
        input.actorUserId = query.actorUserId;
      }

      if (query.actorApiTokenId !== undefined) {
        input.actorApiTokenId = query.actorApiTokenId;
      }

      const items = await dependencies.auditService.listRecent(input);
      return {
        items: redactSensitiveRouteValue(assertRouteResponseObjectList(items, "AUDIT_LIST_RESPONSE_INVALID"))
      };
    }
  );
}
