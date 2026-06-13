const resultSelection = {
    id: true,
    jobId: true,
    fields: true,
    normalizedFields: true,
    evidence: true,
    payload: true,
    confidence: true,
    reviewRequired: true
};
/**
 * 结果仓库按 jobId 做单结果 upsert，保证同一个识别任务始终只有一份当前结果。
 * 这样后续重跑任务或补充字段时，不需要调用方自己判断 create 还是 update。
 */
export function createResultsRepository(dependencies) {
    return {
        async findByJobId(jobId) {
            return dependencies.recognitionResult.findUnique({
                where: { jobId },
                select: resultSelection
            });
        },
        async upsertByJobId(input) {
            const updateData = {
                fields: input.fields,
                normalizedFields: input.normalizedFields ?? {},
                evidence: input.evidence ?? [],
                payload: input.payload ?? {},
                reviewRequired: input.reviewRequired
            };
            const createData = {
                jobId: input.jobId,
                fields: input.fields,
                normalizedFields: input.normalizedFields ?? {},
                evidence: input.evidence ?? [],
                payload: input.payload ?? {},
                reviewRequired: input.reviewRequired
            };
            if (input.confidence !== undefined) {
                updateData.confidence = input.confidence;
                createData.confidence = input.confidence;
            }
            return dependencies.recognitionResult.upsert({
                where: { jobId: input.jobId },
                update: updateData,
                create: createData,
                select: resultSelection
            });
        }
    };
}
//# sourceMappingURL=results.repository.js.map