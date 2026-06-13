import type { PrismaClient } from "@prisma/client";

type StatsRepositoryDeps = Pick<PrismaClient, "recognitionResult" | "feedbackSubmission" | "recognitionJob">;

export interface FieldStatItem {
  fieldKey: string;
  recognitionCount: number;
  avgConfidence: number | null;
  reviewCount: number;
  correctionCount: number;
  commonErrors: Array<{ original: string; corrected: string; count: number }>;
}

export function createStatsService(deps: StatsRepositoryDeps) {
  return {
    async getFieldStats(schemaKey: string, limit = 100): Promise<FieldStatItem[]> {
      // 1) Find all jobs for this schemaKey
      const jobs = await deps.recognitionJob.findMany({
        where: { schemaKey, deletedAt: null },
        select: { id: true },
        take: limit,
      });
      const jobIds = jobs.map((j) => j.id);
      if (jobIds.length === 0) return [];

      // 2) Get all recognition results for these jobs
      const results = await deps.recognitionResult.findMany({
        where: { jobId: { in: jobIds } },
        select: { fields: true, confidence: true, reviewRequired: true },
      });

      // 3) Aggregate per-field recognition data
      const fieldMap = new Map<string, {
        count: number;
        totalConfidence: number;
        confidenceCount: number;
        reviewCount: number;
      }>();

      for (const result of results) {
        const fields = (result.fields ?? {}) as Record<string, unknown>;
        for (const fieldKey of Object.keys(fields)) {
          const existing = fieldMap.get(fieldKey) ?? { count: 0, totalConfidence: 0, confidenceCount: 0, reviewCount: 0 };
          existing.count += 1;
          if (result.confidence) {
            existing.totalConfidence += Number(result.confidence);
            existing.confidenceCount += 1;
          }
          if (result.reviewRequired) {
            existing.reviewCount += 1;
          }
          fieldMap.set(fieldKey, existing);
        }
      }

      // 4) Get feedback data for corrections
      const feedbacks = await deps.feedbackSubmission.findMany({
        where: {
          jobId: { in: jobIds },
          fieldKey: { not: null },
        },
        select: { fieldKey: true, originalValue: true, correctedValue: true },
      });

      const correctionMap = new Map<string, { count: number; errors: Map<string, { original: string; corrected: string; count: number }> }>();
      for (const fb of feedbacks) {
        if (!fb.fieldKey) continue;
        const entry = correctionMap.get(fb.fieldKey) ?? { count: 0, errors: new Map() };
        entry.count += 1;
        const origStr = typeof fb.originalValue === "string" ? fb.originalValue : JSON.stringify(fb.originalValue ?? "");
        const corrStr = typeof fb.correctedValue === "string" ? fb.correctedValue : JSON.stringify(fb.correctedValue ?? "");
        if (origStr !== corrStr) {
          const errorKey = `${origStr}→${corrStr}`;
          const errEntry = entry.errors.get(errorKey) ?? { original: origStr, corrected: corrStr, count: 0 };
          errEntry.count += 1;
          entry.errors.set(errorKey, errEntry);
        }
        correctionMap.set(fb.fieldKey, entry);
      }

      // 5) Merge into result
      const stats: FieldStatItem[] = [];
      for (const [fieldKey, data] of fieldMap) {
        const correction = correctionMap.get(fieldKey);
        const commonErrors = correction
          ? [...correction.errors.values()].sort((a, b) => b.count - a.count).slice(0, 5)
          : [];
        stats.push({
          fieldKey,
          recognitionCount: data.count,
          avgConfidence: data.confidenceCount > 0
            ? Math.round((data.totalConfidence / data.confidenceCount) * 10000) / 10000
            : null,
          reviewCount: data.reviewCount,
          correctionCount: correction?.count ?? 0,
          commonErrors,
        });
      }

      return stats.sort((a, b) => b.recognitionCount - a.recognitionCount);
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
