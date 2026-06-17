import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuleCandidateService } from "./rule-candidate.service";
import type { RuleCandidateRepository } from "../repositories/rule-candidate.repository";
import type { KnowledgeRepository } from "../repositories/knowledge.repository";
import type { EvaluationSampleResult } from "@medical-record-agent/core";

function makeRepoMock() {
  const candidates = new Map<string, any>();
  return {
    create: vi.fn(async (input: any) => {
      const id = `rc-${candidates.size + 1}`;
      const row = { ...input, id, status: "proposed", createdAt: new Date(), decidedAt: null };
      candidates.set(id, row);
      return row;
    }),
    findByField: vi.fn(async (schemaKey: string, fieldKey: string) => {
      return Array.from(candidates.values()).filter(c => c.schemaKey === schemaKey && c.fieldKey === fieldKey);
    }),
    findBySchema: vi.fn(async (schemaKey: string) => {
      return Array.from(candidates.values()).filter(c => c.schemaKey === schemaKey);
    }),
    findById: vi.fn(async (id: string) => candidates.get(id) ?? null),
    existsSimilar: vi.fn(async () => false),
    updateStatus: vi.fn(async (id: string, status: string) => {
      const row = candidates.get(id);
      if (!row) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", statusCode: 404 });
      row.status = status;
      row.decidedAt = new Date();
      return row;
    }),
    updateProposal: vi.fn(async (id: string, proposal: any, hash: string) => {
      const row = candidates.get(id);
      if (!row) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", statusCode: 404 });
      row.proposal = proposal;
      row.proposalHash = hash;
      return row;
    })
  } as unknown as RuleCandidateRepository;
}

function makeKnowledgeRepoMock() {
  return {
    create: vi.fn(async () => ({ id: "kb-1" }))
  } as unknown as KnowledgeRepository;
}

function makeEvaluationRepoMock() {
  return {
    findRunById: vi.fn(async (runId: string) => {
      if (runId === "run-1") {
        return {
          id: "run-1",
          status: "completed",
          schemaVersion: { schemaKey: "test-schema" },
          result: {
            sampleResults: [
              {
                sampleId: "s1",
                status: "completed",
                latencyMs: 100,
                fieldResults: [
                  { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
                ],
                warnings: []
              }
            ] as EvaluationSampleResult[]
          }
        };
      }
      return null;
    }),
    findLatestCompletedRunBySchema: vi.fn(async (schemaKey: string) => ({
      id: "run-1",
      schemaVersion: { schemaKey },
      result: {
        sampleResults: [
          {
            sampleId: "s1",
            status: "completed",
            latencyMs: 100,
            fieldResults: [
              { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
            ],
            warnings: []
          }
        ]
      }
    }))
  };
}

describe("rule-candidate.service", () => {
  let service: ReturnType<typeof createRuleCandidateService>;
  let repo: ReturnType<typeof makeRepoMock>;
  let knowledgeRepo: ReturnType<typeof makeKnowledgeRepoMock>;
  let evaluationRepo: ReturnType<typeof makeEvaluationRepoMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    knowledgeRepo = makeKnowledgeRepoMock();
    evaluationRepo = makeEvaluationRepoMock();
    service = createRuleCandidateService({
      ruleCandidateRepository: repo,
      knowledgeRepository: knowledgeRepo,
      evaluationRepository: evaluationRepo as any
    });
  });

  it("extractFromRun 从评测运行提炼候选", async () => {
    const result = await service.extractFromRun("run-1");
    expect(result.created).toBe(1);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("extractFromRun 运行不存在时抛 404", async () => {
    await expect(service.extractFromRun("nonexistent")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("extractFromRun 无错误样本时返回 0", async () => {
    evaluationRepo.findRunById.mockResolvedValueOnce({
      id: "run-2",
      status: "completed",
      schemaVersion: { schemaKey: "test-schema" },
      result: {
        sampleResults: [
          {
            sampleId: "s1",
            status: "completed",
            latencyMs: 100,
            fieldResults: [
              { fieldKey: "name", groundTruthValue: "张三", predictedValue: "张三", normalizedGroundTruthValue: "张三", normalizedPredictedValue: "张三" }
            ],
            warnings: []
          }
        ]
      }
    });
    const result = await service.extractFromRun("run-2");
    expect(result.created).toBe(0);
  });

  it("review accept 写入知识库", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    await service.review(created.id, "accepted");
    expect(repo.updateStatus).toHaveBeenCalledWith(created.id, "accepted");
    expect(knowledgeRepo.create).toHaveBeenCalledTimes(1);
  });

  it("review reject 不写知识库", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    await service.review(created.id, "rejected");
    expect(repo.updateStatus).toHaveBeenCalledWith(created.id, "rejected");
    expect(knowledgeRepo.create).not.toHaveBeenCalled();
  });

  it("review skipped 不写知识库", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    await service.review(created.id, "skipped");
    expect(repo.updateStatus).toHaveBeenCalledWith(created.id, "skipped");
    expect(knowledgeRepo.create).not.toHaveBeenCalled();
  });

  it("review accept 知识库写入失败时状态回滚", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    (knowledgeRepo.create as any).mockRejectedValueOnce(new Error("DB_ERROR"));
    await expect(service.review(created.id, "accepted")).rejects.toMatchObject({ code: "KNOWLEDGE_WRITE_FAILED" });
    expect(repo.updateStatus).toHaveBeenLastCalledWith(created.id, "proposed");
  });

  it("review edit-and-accept 先更新 proposal 再接受", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    const newProposal = { type: "correction" as const, fieldKey: "sample_type", originalValue: "血清", correctedValue: "全血" };
    await service.review(created.id, "accepted", { proposal: newProposal, proposalHash: "h2" });
    expect(repo.updateProposal).toHaveBeenCalledWith(created.id, newProposal, "h2");
    expect(knowledgeRepo.create).toHaveBeenCalledTimes(1);
  });

  it("extractFromSchema 查找最新完成的运行并提炼", async () => {
    const result = await service.extractFromSchema("test-schema");
    expect(result.created).toBe(1);
  });
});
