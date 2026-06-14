import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import {
  assertRouteResponseObject,
  feedbackRouteInputSchema,
  type ApiRouteResponseObject,
  type CreateFeedbackRouteInput
} from "./route-dtos";

export interface FeedbackRouteService {
  create(input: CreateFeedbackRouteInput): Promise<ApiRouteResponseObject>;
  listByJobId(jobId: string): Promise<ApiRouteResponseObject[]>;
  listAll(input?: { fieldKey?: string; jobId?: string; page?: number; pageSize?: number }): Promise<{ items: ApiRouteResponseObject[]; total: number; page: number; pageSize: number }>;
  getFieldStats(): Promise<Array<{ fieldKey: string; count: number }>>;
}

export interface FeedbackRoutesDependencies {
  feedbackService: FeedbackRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
}

/**
 * 注册反馈采集路由。
 * 反馈既可来自人工纠偏，也可来自调用方系统的质控结果，统一写入 feedback service。
 */
export async function registerFeedbackRoutes(server: FastifyInstance, dependencies: FeedbackRoutesDependencies) {
  server.post(
    "/feedback",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "feedback.create",
                objectType: "feedback"
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const parsed = feedbackRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid feedback payload"
        });
      }

      const input: CreateFeedbackRouteInput = { ...parsed.data };
      if (!input.fieldKey && input.field) {
        input.fieldKey = input.field;
      }

      const feedback = await dependencies.feedbackService.create(input);

      return assertRouteResponseObject(feedback, "FEEDBACK_RESPONSE_INVALID");
    }
  );

  server.get(
    "/feedback",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate)
      ]
    },
    async (request, reply) => {
      const query = request.query as { jobId?: string };
      if (!query.jobId || typeof query.jobId !== "string") {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "jobId query parameter is required"
        });
      }

      const items = await dependencies.feedbackService.listByJobId(query.jobId);

      return {
        items: items.map((item) => assertRouteResponseObject(item, "FEEDBACK_RESPONSE_INVALID"))
      };
    }
  );

  // GET /feedback/all - 全局反馈列表（跨任务）
  server.get(
    "/feedback/all",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate)
      ]
    },
    async (request) => {
      const query = request.query as {
        fieldKey?: string;
        jobId?: string;
        page?: string;
        pageSize?: string;
      };
      const input: { fieldKey?: string; jobId?: string; page?: number; pageSize?: number } = {};
      if (query.fieldKey) input.fieldKey = query.fieldKey;
      if (query.jobId) input.jobId = query.jobId;
      if (query.page) input.page = Math.max(1, parseInt(query.page, 10) || 1);
      if (query.pageSize) input.pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20));

      const result = await dependencies.feedbackService.listAll(input);
      return {
        items: result.items.map((item) => assertRouteResponseObject(item, "FEEDBACK_RESPONSE_INVALID")),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize
      };
    }
  );

  // GET /feedback/stats - 按字段统计反馈数量
  server.get(
    "/feedback/stats",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate)
      ]
    },
    async () => {
      const stats = await dependencies.feedbackService.getFieldStats();
      return { stats };
    }
  );
}
