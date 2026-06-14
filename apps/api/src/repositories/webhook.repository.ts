import type { Prisma, PrismaClient } from "@prisma/client";

type WebhookRepositoryDependencies = Pick<PrismaClient, "webhookSubscription">;

const webhookSelection = {
  id: true,
  callbackUrl: true,
  schemaKey: true,
  events: true,
  active: true,
  createdById: true,
  createdAt: true,
  updatedAt: true
} as const;

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
export function createWebhookRepository(dependencies: WebhookRepositoryDependencies) {
  return {
    async create(input: CreateWebhookSubscriptionInput) {
      return dependencies.webhookSubscription.create({
        data: {
          callbackUrl: input.callbackUrl,
          schemaKey: input.schemaKey ?? null,
          events: input.events ?? ["recognition.completed"],
          createdById: input.createdById ?? null
        },
        select: webhookSelection
      });
    },

    async findById(id: string) {
      return dependencies.webhookSubscription.findUnique({
        where: { id },
        select: webhookSelection
      });
    },

    async listActive(schemaKey?: string) {
      const where: Prisma.WebhookSubscriptionWhereInput = {
        active: true
      };

      if (schemaKey) {
        where.OR = [
          { schemaKey: null },
          { schemaKey }
        ];
      }

      return dependencies.webhookSubscription.findMany({
        where,
        orderBy: { createdAt: "desc" }
      });
    },

    async list(input?: { page?: number; pageSize?: number }) {
      const page = input?.page ?? 1;
      const pageSize = Math.min(input?.pageSize ?? 50, 100);
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        dependencies.webhookSubscription.findMany({
          select: webhookSelection,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        }),
        dependencies.webhookSubscription.count()
      ]);

      return { items, total, page, pageSize };
    },

    async delete(id: string) {
      await dependencies.webhookSubscription.delete({
        where: { id }
      });
    },

    async deactivate(id: string) {
      return dependencies.webhookSubscription.update({
        where: { id },
        data: { active: false },
        select: webhookSelection
      });
    }
  };
}
