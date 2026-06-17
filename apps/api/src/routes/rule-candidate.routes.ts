import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { RuleCandidateService } from "../services/rule-candidate.service";
import type { RuleCandidateStatus } from "@medical-record-agent/shared";

export interface RuleCandidateRoutesDependencies {
  service: RuleCandidateService;
  authHooks: ReturnType<typeof createAuthHooks>;
}

const reviewBodySchema = z.object({
  status: z.enum(["accepted", "rejected", "skipped"]),
  proposal: z.any().optional(),
  proposalHash: z.string().optional()
});

/**
 * 注册规则候选路由。
 * 提供按字段查询候选、审核候选（接受/拒绝/跳过/编辑后接受）、手动触发提炼三个端点。
 */
export async function registerRuleCandidateRoutes(
  server: FastifyInstance,
  dependencies: RuleCandidateRoutesDependencies
) {
  const preHandler = [
    dependencies.authHooks.authenticate,
    dependencies.authHooks.requirePermission(PERMISSIONS.schemaDraft)
  ];

  // 按字段查询候选列表
  server.get(
    "/schemas/:schemaKey/fields/:fieldKey/rule-candidates",
    { preHandler },
    async (request) => {
      const params = request.params as { schemaKey: string; fieldKey: string };
      const query = request.query as { status?: RuleCandidateStatus };
      const items = await dependencies.service.listByField(
        params.schemaKey,
        params.fieldKey,
        query.status
      );
      return { items };
    }
  );

  // 审核候选
  server.patch(
    "/rule-candidates/:id",
    { preHandler },
    async (request, reply) => {
      const parsed = reviewBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "BAD_REQUEST", details: parsed.error.issues });
      }
      const params = request.params as { id: string };
      try {
        const reviewOptions: { proposal?: any; proposalHash?: string } = {};
        if (parsed.data.proposal !== undefined) {
          reviewOptions.proposal = parsed.data.proposal;
        }
        if (parsed.data.proposalHash !== undefined) {
          reviewOptions.proposalHash = parsed.data.proposalHash;
        }
        const result = await dependencies.service.review(params.id, parsed.data.status, reviewOptions);
        return result;
      } catch (err: any) {
        const statusCode = err.statusCode ?? 500;
        return reply.status(statusCode).send({ error: err.code ?? "INTERNAL_ERROR" });
      }
    }
  );

  // 手动触发提炼（按 schema，自动查找最新完成的运行）
  server.post(
    "/schemas/:schemaKey/extract-candidates",
    { preHandler },
    async (request, reply) => {
      const params = request.params as { schemaKey: string };
      try {
        const result = await dependencies.service.extractFromSchema(params.schemaKey);
        return result;
      } catch (err: any) {
        const statusCode = err.statusCode ?? 500;
        return reply.status(statusCode).send({ error: err.code ?? "INTERNAL_ERROR" });
      }
    }
  );
}
