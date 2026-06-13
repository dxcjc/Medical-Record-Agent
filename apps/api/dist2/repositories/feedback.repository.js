/**
 * 反馈仓库承接人工纠偏数据，为后续规则候选、评估集回流和人工审核界面提供统一入口。
 */
export function createFeedbackRepository(dependencies) {
    return {
        async create(input) {
            const data = {
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
        async listByJobId(jobId) {
            return dependencies.feedbackSubmission.findMany({
                where: { jobId },
                orderBy: {
                    createdAt: "desc"
                }
            });
        },
        async markReviewed(id, reviewedAt, status = "reviewed") {
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
//# sourceMappingURL=feedback.repository.js.map