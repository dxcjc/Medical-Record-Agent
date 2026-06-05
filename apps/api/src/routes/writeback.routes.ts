import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";

export interface WritebackRouteService {
  execute(input: unknown): Promise<unknown>;
}

export interface WritebackJobRouteService {
  get(id: string): Promise<unknown | null>;
}

export interface WritebackRoutesDependencies {
  writebackService: WritebackRouteService;
  jobService: WritebackJobRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
}

function isConfirmedWritebackBody(value: unknown): value is { confirmed: true; jobId: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { confirmed?: unknown }).confirmed === true &&
      typeof (value as { jobId?: unknown }).jobId === "string" &&
      (value as { jobId: string }).jobId.length > 0
  );
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
  server.post(
    "/writeback",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute),
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
      if (!isConfirmedWritebackBody(request.body)) {
        return reply.status(409).send({
          error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
        });
      }

      const job = await dependencies.jobService.get(request.body.jobId);
      if (!isServerConfirmedJob(job)) {
        return reply.status(409).send({
          error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
        });
      }

      return dependencies.writebackService.execute(request.body);
    }
  );
}
