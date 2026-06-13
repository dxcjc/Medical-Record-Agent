import type { Prisma, PrismaClient } from "@prisma/client";
type WebhookRepositoryDependencies = Pick<PrismaClient, "webhookSubscription">;
export interface CreateWebhookSubscriptionInput {
    callbackUrl: string;
    schemaKey?: string | null;
    events?: string[];
    createdById?: string | null;
}
export interface UpdateWebhookSubscriptionInput {
    callbackUrl?: string;
    schemaKey?: string | null;
    events?: string[];
    active?: boolean;
}
/**
 * Webhook 仓库负责 webhook 订阅的数据库操作。
 * 支持按 schemaKey 过滤活跃订阅，便于识别任务完成后触发回调。
 */
export declare function createWebhookRepository(dependencies: WebhookRepositoryDependencies): {
    create(input: CreateWebhookSubscriptionInput): Promise<{
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string | null;
        callbackUrl: string;
        events: Prisma.JsonValue;
    }>;
    findById(id: string): Promise<{
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string | null;
        callbackUrl: string;
        events: Prisma.JsonValue;
    } | null>;
    listActive(schemaKey?: string): Promise<{
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string | null;
        callbackUrl: string;
        events: Prisma.JsonValue;
    }[]>;
    list(limit?: number): Promise<{
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string | null;
        callbackUrl: string;
        events: Prisma.JsonValue;
    }[]>;
    delete(id: string): Promise<void>;
    deactivate(id: string): Promise<{
        active: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        schemaKey: string | null;
        callbackUrl: string;
        events: Prisma.JsonValue;
    }>;
};
export {};
//# sourceMappingURL=webhook.repository.d.ts.map