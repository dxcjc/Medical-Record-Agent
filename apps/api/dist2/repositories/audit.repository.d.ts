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
    createdFrom?: Date;
    createdTo?: Date;
    take?: number;
};
type AuditRepositoryDependencies = Pick<PrismaClient, "auditLog">;
/**
 * 创建审计仓储。
 * 这里把“如何写审计”和“如何按最近记录查询”的固定规则集中起来，方便后续中间件直接复用。
 */
export declare function createAuditRepository(dependencies: AuditRepositoryDependencies): {
    /**
     * 写入审计日志。
     * 仓储只接受已经脱敏或安全化后的 metadata，不承接任何明文口令或 token。
     */
    create(input: CreateAuditLogInput): Promise<{
        result: import("@prisma/client").$Enums.AuditResult;
        id: string;
        action: string;
        objectType: string;
        objectId: string | null;
    }>;
    /**
     * 查询最近审计记录。
     * 默认按创建时间倒序，便于登录审计、权限追踪等场景直接消费。
     */
    listRecent(input: ListRecentAuditLogsInput): Promise<{
        result: import("@prisma/client").$Enums.AuditResult;
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        actorUserId: string | null;
        actorApiTokenId: string | null;
        action: string;
        objectType: string;
        objectId: string | null;
        ipAddress: string | null;
        userAgent: string | null;
    }[]>;
};
export {};
//# sourceMappingURL=audit.repository.d.ts.map