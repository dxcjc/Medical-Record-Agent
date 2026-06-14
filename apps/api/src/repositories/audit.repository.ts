import type { Prisma, PrismaClient } from "@prisma/client";
import { AuditResult } from "@prisma/client";

export type CreateAuditLogInput = {
  actorUserId?: string;
  actorApiTokenId?: string;
  action: string;
  objectType: string;
  objectId?: string;
  result: AuditResult;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
};

export type ListRecentAuditLogsInput = {
  actorUserId?: string;
  actorApiTokenId?: string;
  action?: string;
  objectType?: string;
  createdFrom?: Date;
  createdTo?: Date;
  take?: number;
  page?: number;
  pageSize?: number;
};

type AuditRepositoryDependencies = Pick<PrismaClient, "auditLog">;

const auditCreateSelection = {
  id: true,
  action: true,
  objectType: true,
  objectId: true,
  result: true,
  createdAt: true
} as const;

/**
 * 创建审计仓储。
 * 这里把“如何写审计”和“如何按最近记录查询”的固定规则集中起来，方便后续中间件直接复用。
 */
export function createAuditRepository(dependencies: AuditRepositoryDependencies) {
  const { auditLog } = dependencies;

  return {
    /**
     * 写入审计日志。
     * 仓储只接受已经脱敏或安全化后的 metadata，不承接任何明文口令或 token。
     */
    async create(input: CreateAuditLogInput) {
      const data: Prisma.AuditLogUncheckedCreateInput = {
        action: input.action,
        objectType: input.objectType,
        result: input.result,
        metadata: input.metadata ?? {}
      };

      if (input.actorUserId !== undefined) {
        data.actorUserId = input.actorUserId;
      }

      if (input.actorApiTokenId !== undefined) {
        data.actorApiTokenId = input.actorApiTokenId;
      }

      if (input.objectId !== undefined) {
        data.objectId = input.objectId;
      }

      if (input.ipAddress !== undefined) {
        data.ipAddress = input.ipAddress;
      }

      if (input.userAgent !== undefined) {
        data.userAgent = input.userAgent;
      }

      return auditLog.create({
        data,
        select: auditCreateSelection
      });
    },

    /**
     * 查询最近审计记录。
     * 默认按创建时间倒序，便于登录审计、权限追踪等场景直接消费。
     * 支持分页（page/pageSize）和 objectType 筛选。
     */
    async listRecent(input: ListRecentAuditLogsInput) {
      const createdAt: {
        gte?: Date;
        lte?: Date;
      } | undefined = input.createdFrom || input.createdTo ? {} : undefined;

      if (createdAt && input.createdFrom) {
        createdAt.gte = input.createdFrom;
      }

      if (createdAt && input.createdTo) {
        createdAt.lte = input.createdTo;
      }

      const where: {
        actorUserId?: string;
        actorApiTokenId?: string;
        action?: string;
        objectType?: string;
        createdAt?: {
          gte?: Date;
          lte?: Date;
        };
      } = {};

      if (input.actorUserId) {
        where.actorUserId = input.actorUserId;
      }

      if (input.actorApiTokenId) {
        where.actorApiTokenId = input.actorApiTokenId;
      }

      if (input.action) {
        where.action = input.action;
      }

      if (input.objectType) {
        where.objectType = input.objectType;
      }

      if (createdAt) {
        where.createdAt = createdAt;
      }

      // 分页模式：使用 page + pageSize
      if (input.page !== undefined && input.pageSize !== undefined) {
        const skip = (input.page - 1) * input.pageSize;
        const [items, total] = await Promise.all([
          auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: input.pageSize,
            include: {
              actorUser: {
                select: { id: true, email: true, displayName: true }
              }
            }
          }),
          auditLog.count({ where })
        ]);
        return { items, total, page: input.page, pageSize: input.pageSize };
      }

      // 兼容原有 take 模式
      const items = await auditLog.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        take: input.take ?? 50,
        include: {
          actorUser: {
            select: { id: true, email: true, displayName: true }
          }
        }
      });
      return { items, total: items.length };
    }
  };
}
