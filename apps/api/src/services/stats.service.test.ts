import { describe, expect, it, vi } from "vitest";
import { createStatsService, type FieldStatItem } from "./stats.service";

describe("createStatsService", () => {
  function createMockDeps(overrides: Record<string, unknown> = {}) {
    return {
      recognitionJob: {
        findMany: vi.fn(async () => []),
      },
      recognitionResult: {
        findMany: vi.fn(async () => []),
      },
      feedbackSubmission: {
        findMany: vi.fn(async () => []),
      },
      ...overrides,
    } as unknown as Parameters<typeof createStatsService>[0];
  }

  describe("getFieldStats", () => {
    it("should return empty array when no jobs found", async () => {
      const deps = createMockDeps();
      const service = createStatsService(deps);
      const result = await service.getFieldStats("nonexistent-schema");
      expect(result).toEqual([]);
    });

    it("should aggregate recognition count per field", async () => {
      const deps = createMockDeps({
        recognitionJob: {
          findMany: vi.fn(async () => [{ id: "job-1" }, { id: "job-2" }]),
        },
        recognitionResult: {
          findMany: vi.fn(async () => [
            { fields: { patientName: "张三", age: "50" }, confidence: "0.9", reviewRequired: false },
            { fields: { patientName: "李四", gender: "男" }, confidence: "0.8", reviewRequired: true },
          ]),
        },
        feedbackSubmission: {
          findMany: vi.fn(async () => []),
        },
      });

      const service = createStatsService(deps);
      const result = await service.getFieldStats("tumor-gene-test");

      expect(result).toHaveLength(3);

      const patientNameStat = result.find((s) => s.fieldKey === "patientName");
      expect(patientNameStat).toBeDefined();
      expect(patientNameStat!.recognitionCount).toBe(2);
      expect(patientNameStat!.avgConfidence).toBe(0.85);
      expect(patientNameStat!.reviewCount).toBe(1);
      expect(patientNameStat!.correctionCount).toBe(0);
    });

    it("should aggregate feedback corrections into commonErrors", async () => {
      const deps = createMockDeps({
        recognitionJob: {
          findMany: vi.fn(async () => [{ id: "job-1" }]),
        },
        recognitionResult: {
          findMany: vi.fn(async () => [
            { fields: { patientName: "张三丰" }, confidence: "0.6", reviewRequired: true },
          ]),
        },
        feedbackSubmission: {
          findMany: vi.fn(async () => [
            { fieldKey: "patientName", originalValue: "张三丰", correctedValue: "张三" },
            { fieldKey: "patientName", originalValue: "张三丰", correctedValue: "张三" },
            { fieldKey: "patientName", originalValue: "李四", correctedValue: "李四丰" },
          ]),
        },
      });

      const service = createStatsService(deps);
      const result = await service.getFieldStats("tumor-gene-test");

      const stat = result.find((s) => s.fieldKey === "patientName");
      expect(stat).toBeDefined();
      expect(stat!.correctionCount).toBe(3);
      expect(stat!.commonErrors).toHaveLength(2);
      // Most common error first
      const firstError = stat!.commonErrors[0]!;
      expect(firstError.count).toBe(2);
      expect(firstError.original).toContain("张三丰");
      expect(firstError.corrected).toContain("张三");
    });

    it("should pass limit to findMany", async () => {
      const deps = createMockDeps();
      const service = createStatsService(deps);
      await service.getFieldStats("test-schema", 50);
      expect(deps.recognitionJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });
});
