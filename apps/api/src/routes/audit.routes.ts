import type { FastifyInstance } from "fastify";

import type { AuthHooksDependencies } from "../middleware/auth.middleware";

export interface AuditListInput {
  actorUserId?: string;
  actorApiTokenId?: string;
  action?: string;
  take?: number;
}

export interface AuditRouteService {
  listRecent(input: AuditListInput): Promise<unknown[]>;
}

export interface AuditRoutesDependencies {
  auditService: AuditRouteService;
  authHooks: ReturnType<typeof import("../middleware/auth.middleware").createAuthHooks>;
}

function readStringQuery(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readTakeQuery(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(parsed, 100);
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
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const input: AuditListInput = {};
      const take = readTakeQuery(query.take);
      const action = readStringQuery(query.action);
      const actorUserId = readStringQuery(query.actorUserId);
      const actorApiTokenId = readStringQuery(query.actorApiTokenId);

      if (take !== undefined) {
        input.take = take;
      }

      if (action !== undefined) {
        input.action = action;
      }

      if (actorUserId !== undefined) {
        input.actorUserId = actorUserId;
      }

      if (actorApiTokenId !== undefined) {
        input.actorApiTokenId = actorApiTokenId;
      }

      const items = await dependencies.auditService.listRecent(input);
      return {
        items
      };
    }
  );
}
