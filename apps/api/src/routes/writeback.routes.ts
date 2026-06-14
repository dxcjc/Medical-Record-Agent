import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import {
  assertRouteResponseObject,
  assertRouteResponseObjectList,
  confirmedWritebackRouteInputSchema,
  type ApiRouteResponseObject
} from "./route-dtos";

export interface WritebackRouteService {
  execute(input: ExecuteWritebackRouteInput): Promise<ApiRouteResponseObject>;
  listEligible(input: { actor: AuthContext; limit: number }): Promise<ApiRouteResponseObject[]>;
  listHistory(input?: { page?: number; pageSize?: number }): Promise<{ items: ApiRouteResponseObject[]; total: number; page: number; pageSize: number }>;
}

export interface WritebackJobRouteService {
  get(id: string): Promise<unknown | null>;
}

export interface WritebackRoutesDependencies {
  writebackService: WritebackRouteService;
  jobService: WritebackJobRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
  rateLimit?: preHandlerHookHandler;
}

export interface ExecuteWritebackRouteInput {
  jobId: string;
  confirmed: true;
  idempotencyKey?: string;
  actor: AuthContext;
}

function isServerConfirmedJob(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const status = (value as { status?: unknown }).status;
  const confirmed = (value as { confirmed?: unknown }).confirmed;

  return status === "completed" || status === "confirmed" || confirmed === true;
}

/**
 * 注册自动写回路由。
 * Agent 本身不承载人工确认 UI，但写回 API 仍要求调用方传入 confirmed=true，避免低置信或未授权任务被直接回填。
 */
export async function registerWritebackRoutes(server: FastifyInstance, dependencies: WritebackRoutesDependencies) {
  server.get(
    "/writeback/eligible",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute)
      ]
    },
    async (request) => {
      const query = request.query as { limit?: unknown };
      const parsedLimit = typeof query.limit === "string" ? Number(query.limit) : undefined;
      const limit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

      return {
        items: assertRouteResponseObjectList(
          await dependencies.writebackService.listEligible({
            actor: request.auth as AuthContext,
            limit
          }),
          "WRITEBACK_ELIGIBLE_RESPONSE_INVALID"
        )
      };
    }
  );

  server.post(
    "/writeback",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute),
        ...(dependencies.rateLimit ? [dependencies.rateLimit] : []),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "writeback.execute",
                objectType: "job",
                objectId: (request) => (request.body as { jobId?: string } | undefined)?.jobId
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const parsedBody = confirmedWritebackRouteInputSchema.safeParse(request.body);
      if (!parsedBody.success) {
        const confirmed = request.body && typeof request.body === "object" ? (request.body as { confirmed?: unknown }).confirmed : undefined;
        if (confirmed !== true) {
          return reply.status(409).send({
            error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
          });
        }

        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid writeback payload"
        });
      }

      const parsedInput: Omit<ExecuteWritebackRouteInput, "actor"> = {
        jobId: parsedBody.data.jobId,
        confirmed: true
      };

      if (parsedBody.data.idempotencyKey !== undefined) {
        parsedInput.idempotencyKey = parsedBody.data.idempotencyKey;
      }

      const job = await dependencies.jobService.get(parsedInput.jobId);
      if (!isServerConfirmedJob(job)) {
        return reply.status(409).send({
          error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
        });
      }

      return assertRouteResponseObject(
        await dependencies.writebackService.execute({
          ...parsedInput,
          actor: request.auth as AuthContext
        }),
        "WRITEBACK_RESPONSE_INVALID"
      );
    }
  );

  // GET /writeback/history - 回写历史列表
  server.get(
    "/writeback/history",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute)
      ]
    },
    async (request) => {
      const query = request.query as { page?: string; pageSize?: string };
      const page = query.page ? Math.max(1, parseInt(query.page, 10) || 1) : 1;
      const pageSize = query.pageSize ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20)) : 20;

      const result = await dependencies.writebackService.listHistory({ page, pageSize });
      return {
        items: assertRouteResponseObjectList(result.items, "WRITEBACK_HISTORY_RESPONSE_INVALID"),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize
      };
    }
  );
}
