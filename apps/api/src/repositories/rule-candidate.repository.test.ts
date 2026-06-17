import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuleCandidateRepository } from "./rule-candidate.repository";

// 最小 Prisma mock
function makePrismaMock() {
  const store = new Map<string, any>();
  return {
    ruleCandidate: {
      create: vi.fn(async ({ data }: any) => {
        store.set(data.id ?? `rc-${store.size + 1}`, { ...data, id: data.id ?? `rc-${store.size + 1}` });
        return store.get(Array.from(store.keys()).pop()!);
      }),
      findMany: vi.fn(async ({ where }: any) => {
        let items = Array.from(store.values());
        if (where?.schemaKey) items = items.filter(i => i.schemaKey === where.schemaKey);
        if (where?.fieldKey) items = items.filter(i => i.fieldKey === where.fieldKey);
        if (where?.status) items = items.filter(i => i.status === where.status);
        return items;
      }),
      findUnique: vi.fn(async ({ where }: any) => store.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = store.get(where.id);
        if (!existing) throw new Error("NOT_FOUND");
        const updated = { ...existing, ...data };
        store.set(where.id, updated);
        return updated;
      }),
      count: vi.fn(async ({ where }: any) => {
        let items = Array.from(store.values());
        if (where?.schemaKey && where?.fieldKey && where?.proposalHash) {
          items = items.filter(i =>
            i.schemaKey === where.schemaKey &&
            i.fieldKey === where.fieldKey &&
            i.proposalHash === where.proposalHash
          );
        }
        return items.length;
      })
    }
  };
}

describe("rule-candidate.repository", () => {
  let repo: ReturnType<typeof createRuleCandidateRepository>;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    repo = createRuleCandidateRepository(prisma as any);
  });

  it("create 持久化并返回候选", async () => {
    const result = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [{ runId: "r1", sampleId: "s1", fieldKey: "sample_type" }],
      proposalHash: "hash-001"
    });
    expect(result.id).toBeDefined();
    expect(result.status).toBe("proposed");
    expect(result.ruleType).toBe("correction");
  });

  it("findByField 按字段过滤候选", async () => {
    await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    await repo.create({
      schemaKey: "test-schema",
      fieldKey: "gene",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "gene", originalValue: "KRAS", correctedValue: "EGFR" },
      evidence: [],
      proposalHash: "h2"
    });
    const items = await repo.findByField("test-schema", "sample_type");
    expect(items).toHaveLength(1);
    expect(items[0]!.fieldKey).toBe("sample_type");
  });

  it("existsSimilar 检测重复候选", async () => {
    await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "hash-dup"
    });
    const exists = await repo.existsSimilar("test-schema", "sample_type", "hash-dup");
    expect(exists).toBe(true);
    const notExists = await repo.existsSimilar("test-schema", "sample_type", "hash-other");
    expect(notExists).toBe(false);
  });

  it("updateStatus 更新状态和 decidedAt", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    const updated = await repo.updateStatus(created.id, "accepted");
    expect(updated.status).toBe("accepted");
    expect(updated.decidedAt).toBeDefined();
  });

  it("updateProposal 更新 proposal 内容", async () => {
    const created = await repo.create({
      schemaKey: "test-schema",
      fieldKey: "sample_type",
      ruleType: "correction",
      proposal: { type: "correction", fieldKey: "sample_type", originalValue: "血清", correctedValue: "外周血" },
      evidence: [],
      proposalHash: "h1"
    });
    const newProposal = { type: "correction" as const, fieldKey: "sample_type", originalValue: "血清", correctedValue: "全血" };
    const updated = await repo.updateProposal(created.id, newProposal, "hash-002");
    expect(updated.proposal).toEqual(newProposal);
    expect(updated.proposalHash).toBe("hash-002");
  });
});
