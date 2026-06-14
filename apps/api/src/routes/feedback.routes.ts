import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import {
  assertRouteResponseObject,
  feedbackRouteInputSchema,
  feedbackListQuerySchema,
  feedbackAllQuerySchema,
  type ApiRouteResponseObject,
  type CreateFeedbackRouteInput
} from "./route-dtos";

export interface FeedbackRouteService {
  create(input: CreateFeedbackRouteInput): Promise<ApiRouteResponseObject>;
  listByJobId(jobId: string): Promise<ApiRouteResponseObject[]>;
  listAll(input?: { fieldKey?: string; jobId?: string; page?: number; pageSize?: number }): Promise<{ items: ApiRouteResponseObject[]; total: number; page: number; pageSize: number }>;
  getFieldStats(): Promise<Array<{ fieldKey: string; count: number }>>;
  updateStatus(id: string, status: 'approved' | 'rejected'): Promise<ApiRouteResponseObject>;
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
      const parsed = feedbackListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "jobId query parameter is required"
        });
      }

      const items = await dependencies.feedbackService.listByJobId(parsed.data.jobId);

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
      const parsed = feedbackAllQuerySchema.safeParse(request.query);
      const data = parsed.success ? parsed.data : {};
      const input: { fieldKey?: string; jobId?: string; page?: number; pageSize?: number } = {};
      if (data.fieldKey) input.fieldKey = data.fieldKey;
      if (data.jobId) input.jobId = data.jobId;
      if (data.page !== undefined) input.page = data.page;
      if (data.pageSize !== undefined) input.pageSize = data.pageSize;

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

  // PATCH /feedback/:id - 更新反馈审核状态
  server.patch(
    "/feedback/:id",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "feedback.review",
                objectType: "feedback",
                objectId: (request) => (request.params as { id?: string }).id
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { status?: string };

      if (!body.status || !['approved', 'rejected'].includes(body.status)) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "status must be 'approved' or 'rejected'"
        });
      }

      try {
        const feedback = await dependencies.feedbackService.updateStatus(
          params.id,
          body.status as 'approved' | 'rejected'
        );
        return assertRouteResponseObject(feedback, "FEEDBACK_RESPONSE_INVALID");
      } catch (error: unknown) {
        const err = error as { code?: string; statusCode?: number };
        if (err.code === "FEEDBACK_NOT_FOUND") {
          return reply.status(404).send({ error: "NOT_FOUND", message: "反馈记录不存在" });
        }
        throw error;
      }
    }
  );
}
