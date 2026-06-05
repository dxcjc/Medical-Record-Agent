import type { FeedbackStatus, Prisma, PrismaClient } from "@prisma/client";

type FeedbackRepositoryDependencies = Pick<PrismaClient, "feedbackSubmission">;

export interface CreateFeedbackInput {
  jobId: string;
  schemaVersionId?: string | null;
  submittedById?: string | null;
  fieldKey?: string | null;
  originalValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  correctedValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  comment?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * 反馈仓库承接人工纠偏数据，为后续规则候选、评估集回流和人工审核界面提供统一入口。
 */
export function createFeedbackRepository(dependencies: FeedbackRepositoryDependencies) {
  return {
    async create(input: CreateFeedbackInput) {
      const data: Prisma.FeedbackSubmissionUncheckedCreateInput = {
        jobId: input.jobId,
        schemaVersionId: input.schemaVersionId ?? null,
        submittedById: input.submittedById ?? null,
        fieldKey: input.fieldKey ?? null,
        comment: input.comment ?? null,
        metadata: input.metadata ?? {}
      };

      if (input.originalValue !== undefined) {
        data.originalValue = input.originalValue;
      }

      if (input.correctedValue !== undefined) {
        data.correctedValue = input.correctedValue;
      }

      return dependencies.feedbackSubmission.create({
        data
      });
    },

    async listByJobId(jobId: string) {
      return dependencies.feedbackSubmission.findMany({
        where: { jobId },
        orderBy: {
          createdAt: "desc"
        }
      });
    },

    async markReviewed(id: string, reviewedAt: Date, status: FeedbackStatus = "reviewed") {
      return dependencies.feedbackSubmission.update({
        where: { id },
        data: {
          status,
          reviewedAt
        }
      });
    }
  };
}
