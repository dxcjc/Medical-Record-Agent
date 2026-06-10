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
}
