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
  objectType?: string;
  take?: number;
  page?: number;
  pageSize?: number;
  createdFrom?: Date;
  createdTo?: Date;
}

export interface AuditRouteService {
  listRecent(input: AuditListInput): Promise<ApiRouteResponseObject[] | { items: ApiRouteResponseObject[]; total: number; page?: number; pageSize?: number }>;
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

      if (query.objectType !== undefined) {
        input.objectType = query.objectType;
      }

      if (query.startDate !== undefined) {
        input.createdFrom = new Date(query.startDate);
      }

      if (query.endDate !== undefined) {
        const endDate = new Date(query.endDate);
        // 包含结束日期当天
        endDate.setHours(23, 59, 59, 999);
        input.createdTo = endDate;
      }

      if (query.page !== undefined) {
        input.page = query.page;
      }

      if (query.pageSize !== undefined) {
        input.pageSize = query.pageSize;
      }

      const result = await dependencies.auditService.listRecent(input);

      // 兼容数组返回和分页对象返回
      if (Array.isArray(result)) {
        return {
          items: redactSensitiveRouteValue(assertRouteResponseObjectList(result, "AUDIT_LIST_RESPONSE_INVALID"))
        };
      }

      return {
        items: redactSensitiveRouteValue(assertRouteResponseObjectList(result.items, "AUDIT_LIST_RESPONSE_INVALID")),
        total: result.total,
        page: result.page ?? input.page ?? 1,
        pageSize: result.pageSize ?? input.pageSize ?? 20,
      };
    }
  );

  // GET /audit/export — 导出审计日志为 CSV
  server.get(
    "/audit/export",
    {
      preHandler: [dependencies.authHooks.authenticate, dependencies.authHooks.requirePermission("audit:read")]
    },
    async (request, reply) => {
      const parsed = auditListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid audit export query"
        });
      }

      const query = parsed.data;
      const input: AuditListInput = { take: 1000 }; // 导出上限

      if (query.action !== undefined) input.action = query.action;
      if (query.actorUserId !== undefined) input.actorUserId = query.actorUserId;
      if (query.objectType !== undefined) input.objectType = query.objectType;
      if (query.startDate !== undefined) input.createdFrom = new Date(query.startDate);
      if (query.endDate !== undefined) {
        const endDate = new Date(query.endDate);
        endDate.setHours(23, 59, 59, 999);
        input.createdTo = endDate;
      }

      const result = await dependencies.auditService.listRecent(input);
      const items = Array.isArray(result) ? result : result.items;

      // CSV 生成
      const csvHeader = '时间,操作人,操作类型,对象类型,对象ID,结果,详情\n';
      const csvRows = (items as Array<Record<string, unknown>>).map((item) => {
        const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
        const actorUser = item.actorUser as Record<string, unknown> | undefined;
        const actor = actorUser?.displayName || item.actorUserId || '';
        const action = item.action || '';
        const objectType = item.objectType || '';
        const objectId = item.objectId || '';
        const resultVal = item.result || '';
        const metadata = item.metadata ? JSON.stringify(item.metadata).replace(/"/g, '""') : '';

        return `"${createdAt}","${actor}","${action}","${objectType}","${objectId}","${resultVal}","${metadata}"`;
      }).join('\n');

      const csv = csvHeader + csvRows;
      const today = new Date().toISOString().slice(0, 10);

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename=audit-${today}.csv`);

      // 添加 BOM 以便 Excel 正确识别 UTF-8
      return '﻿' + csv;
    }
  );
}
