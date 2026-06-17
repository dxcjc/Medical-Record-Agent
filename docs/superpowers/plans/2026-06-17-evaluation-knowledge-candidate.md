# 评测错误提炼知识候选 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从评测运行的错误样本中提炼知识候选，存入 RuleCandidate 表，用户在 Schema 详情页字段卡片中审核（接受/拒绝/编辑后接受/跳过），接受时写入知识库。

**架构：** EvaluationAgent 新增 `generateCandidates()` 纯函数，接收所有 sampleResults 产出候选 proposal 列表。新建 RuleCandidateRepository 负责持久化和去重，RuleCandidateService 负责编排（自动提炼/手动提炼/审核）。前端在 FieldCard 底部嵌入候选列表，支持四种操作。

**技术栈：** TypeScript monorepo, Fastify, Prisma, React + @arco-design/web-react, @tanstack/react-query, Vitest

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `apps/api/src/repositories/rule-candidate.repository.ts` | RuleCandidate CRUD + 去重检查 |
| `apps/api/src/repositories/rule-candidate.repository.test.ts` | 仓库单元测试 |
| `apps/api/src/services/rule-candidate.service.ts` | 候选提炼编排 + 审核逻辑 |
| `apps/api/src/services/rule-candidate.service.test.ts` | 服务单元测试 |
| `apps/api/src/routes/rule-candidate.routes.ts` | API 路由 |
| `medical-ui/src/hooks/useRuleCandidates.ts` | React Query hooks |
| `medical-ui/src/components/RuleCandidateList.tsx` | 候选列表组件（嵌入 FieldCard） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | RuleCandidateStatus 加 `skipped`，RuleCandidate 加 `proposalHash` 字段和索引 |
| `packages/shared/src/types.ts` | 更新 RuleCandidate 接口，新增 proposal/evidence 类型 |
| `packages/shared/src/fixtures.ts` | 更新 demoRuleCandidate |
| `packages/core/src/agents/evaluationAgent.ts` | 新增 `generateCandidates()` 导出函数 |
| `packages/core/src/agents/evaluationAgent.test.ts` | 提炼逻辑测试 |
| `apps/api/src/bootstrap/production-services.ts` | 装配 repository/service，评测完成后自动提炼 |
| `apps/api/src/server.ts` | 注册路由 |
| `medical-ui/src/api/types.ts` | 新增 RuleCandidate 前端类型 |
| `medical-ui/src/api/client.ts` | 新增 ruleCandidateApi |
| `medical-ui/src/components/FieldCard.tsx` | 嵌入 RuleCandidateList |

---

## 任务 1：Prisma Schema 变更

**文件：**
- 修改：`prisma/schema.prisma:64-68`（enum）、`prisma/schema.prisma:316-332`（model）

- [ ] **步骤 1：更新 RuleCandidateStatus enum**

在 `prisma/schema.prisma` 第 64-68 行，将 enum 改为：

```prisma
enum RuleCandidateStatus {
  proposed
  accepted
  rejected
  skipped
}
```

- [ ] **步骤 2：更新 RuleCandidate model**

在 `prisma/schema.prisma` 第 316-332 行，将 model 改为：

```prisma
model RuleCandidate {
  id            String              @id @default(cuid())
  feedbackId    String?
  schemaKey     String
  fieldKey      String
  status        RuleCandidateStatus @default(proposed)
  ruleType      String
  proposal      Json
  evidence      Json                @default("[]")
  proposalHash  String?
  createdAt     DateTime            @default(now())
  decidedAt     DateTime?
  updatedAt     DateTime            @updatedAt
  feedback      FeedbackSubmission? @relation(fields: [feedbackId], references: [id], onDelete: SetNull)

  @@index([feedbackId])
  @@index([schemaKey, fieldKey])
  @@index([status])
  @@index([schemaKey, fieldKey, proposalHash])
}
```

- [ ] **步骤 3：生成迁移并应用**

运行：
```bash
cd D:/02-Learning/agent && npx prisma migrate dev --name add-rule-candidate-skipped-and-hash
```
预期：生成新迁移文件，Prisma client 重新生成，数据库 schema 更新成功。

- [ ] **步骤 4：验证 Prisma client 包含新字段**

运行：
```bash
cd D:/02-Learning/agent && node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); console.log(Object.keys(p.ruleCandidate.fields).sort())"
```
预期：输出包含 `proposalHash`, `updatedAt`, `skipped` 状态可用。

- [ ] **步骤 5：Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: RuleCandidate 加 skipped 状态、proposalHash 去重字段"
```

---

## 任务 2：共享类型更新

**文件：**
- 修改：`packages/shared/src/types.ts:388-402`
- 修改：`packages/shared/src/fixtures.ts:226-233`

- [ ] **步骤 1：更新 RuleCandidate 相关类型**

在 `packages/shared/src/types.ts` 中，替换第 388-402 行的 RuleCandidate 定义为：

```typescript
/** 规则候选状态：proposed 待审核 | accepted 已接受 | rejected 已拒绝 | skipped 暂跳过 */
export type RuleCandidateStatus = "proposed" | "accepted" | "rejected" | "skipped";

/** 纠偏记录候选 proposal */
export interface CorrectionProposal {
  type: "correction";
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
}

/** 结构化规则候选 proposal */
export interface RuleProposal {
  type: "rule";
  fieldKey: string;
  condition: string;
  expectedValue: string;
  evidenceCount: number;
}

export type RuleCandidateProposal = CorrectionProposal | RuleProposal;

/** 候选证据，可追溯到具体评测运行和样本 */
export interface RuleCandidateEvidence {
  runId: string;
  sampleId: string;
  fieldKey: string;
}

/** 规则候选来自反馈或评测失败样本，等待人工确认后才能进入生产规则。 */
export interface RuleCandidate {
  id: string;
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: readonly RuleCandidateEvidence[];
  status: RuleCandidateStatus;
  proposalHash: string | null;
  createdAt: IsoDateTimeString;
  decidedAt: IsoDateTimeString | null;
}
```

- [ ] **步骤 2：更新 demoRuleCandidate fixture**

在 `packages/shared/src/fixtures.ts` 中，替换第 226-233 行的 `demoRuleCandidate` 为：

```typescript
export const demoRuleCandidate: RuleCandidate = {
  id: "demo-rule-candidate-001",
  schemaKey: "tumor-gene-test",
  fieldKey: "sample_type",
  ruleType: "rule",
  proposal: {
    type: "rule",
    fieldKey: "sample_type",
    condition: '当 OCR 块包含"样本类型：外周血"时',
    expectedValue: "外周血",
    evidenceCount: 3
  },
  evidence: [
    { runId: "demo-eval-run-001", sampleId: "demo-eval-sample-001", fieldKey: "sample_type" }
  ],
  status: "proposed",
  proposalHash: "demo-hash-001",
  createdAt: "2026-06-04T08:14:00.000Z",
  decidedAt: null
};
```

- [ ] **步骤 3：验证类型编译通过**

运行：
```bash
cd D:/02-Learning/agent && npx tsc --noEmit -p packages/shared/tsconfig.json
```
预期：无错误。

- [ ] **步骤 4：Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/fixtures.ts
git commit -m "feat: 更新 RuleCandidate 类型，新增 proposal/evidence 结构"
```

---

## 任务 3：候选生成逻辑（EvaluationAgent 扩展）

**文件：**
- 修改：`packages/core/src/agents/evaluationAgent.ts`
- 修改：`packages/core/src/agents/evaluationAgent.test.ts`（如不存在则创建）

- [ ] **步骤 1：编写 generateCandidates 失败测试**

在 `packages/core/src/agents/evaluationAgent.test.ts` 中添加测试：

```typescript
import { describe, it, expect } from "vitest";
import { generateCandidates } from "./evaluationAgent";
import type { EvaluationSampleResult } from "../evaluation/metrics";

describe("generateCandidates", () => {
  it("无错误样本时返回空数组", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "name", groundTruthValue: "张三", predictedValue: "张三", normalizedGroundTruthValue: "张三", normalizedPredictedValue: "张三" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toEqual([]);
  });

  it("单条错误生成纠偏候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].ruleType).toBe("correction");
    expect(candidates[0].proposal).toEqual({
      type: "correction",
      fieldKey: "sample_type",
      originalValue: "血清",
      correctedValue: "外周血"
    });
    expect(candidates[0].evidence).toHaveLength(1);
    expect(candidates[0].evidence[0].sampleId).toBe("s1");
  });

  it("同字段 ≥2 条错误时额外生成规则候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
        ],
        warnings: []
      },
      {
        sampleId: "s2",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血浆", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血浆" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    // 2 条纠偏候选 + 1 条规则候选
    expect(candidates).toHaveLength(3);
    const ruleCandidate = candidates.find(c => c.ruleType === "rule");
    expect(ruleCandidate).toBeDefined();
    expect(ruleCandidate!.proposal.type).toBe("rule");
    expect((ruleCandidate!.proposal as any).expectedValue).toBe("外周血");
    expect((ruleCandidate!.proposal as any).evidenceCount).toBe(2);
  });

  it("多个字段各有错误时分别生成候选", () => {
    const results: EvaluationSampleResult[] = [
      {
        sampleId: "s1",
        status: "completed",
        latencyMs: 100,
        fieldResults: [
          { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" },
          { fieldKey: "gene", groundTruthValue: "EGFR", predictedValue: "KRAS", normalizedGroundTruthValue: "EGFR", normalizedPredictedValue: "KRAS" }
        ],
        warnings: []
      }
    ];
    const candidates = generateCandidates(results, "test-schema");
    expect(candidates).toHaveLength(2);
    expect(candidates.map(c => c.fieldKey).sort()).toEqual(["gene", "sample_type"]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run packages/core/src/agents/evaluationAgent.test.ts --reporter=verbose
```
预期：FAIL，报错 `generateCandidates is not exported` 或模块不存在。

- [ ] **步骤 3：实现 generateCandidates 函数**

在 `packages/core/src/agents/evaluationAgent.ts` 文件末尾添加：

```typescript
import type {
  RuleCandidate,
  RuleCandidateProposal,
  RuleCandidateEvidence,
  CorrectionProposal,
  RuleProposal
} from "@medical-records/shared";
import type { EvaluationSampleResult } from "../evaluation/metrics";
import { createHash } from "node:crypto";

/** 候选生成中间结构 */
interface CandidateDraft {
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: RuleCandidateEvidence[];
  proposalHash: string;
}

function computeProposalHash(proposal: RuleCandidateProposal): string {
  let content: string;
  if (proposal.type === "correction") {
    content = `${proposal.fieldKey}|${proposal.originalValue}|${proposal.correctedValue}`;
  } else {
    content = `${proposal.fieldKey}|${proposal.condition}|${proposal.expectedValue}`;
  }
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * 从评测运行的错误样本中提炼知识候选。
 * - 单条错误 → 纠偏记录候选 (correction)
 * - 同字段 ≥2 条错误 → 额外聚合生成结构化规则候选 (rule)
 */
export function generateCandidates(
  sampleResults: EvaluationSampleResult[],
  schemaKey: string
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];

  // 按字段收集错误
  const errorsByField = new Map<string, Array<{
    sampleId: string;
    runId: string;
    originalValue: string;
    correctedValue: string;
  }>>();

  for (const result of sampleResults) {
    if (result.status !== "completed") continue;
    for (const field of result.fieldResults) {
      if (!field.fieldKey) continue;
      const truth = field.normalizedGroundTruthValue ?? field.groundTruthValue;
      const pred = field.normalizedPredictedValue ?? field.predictedValue;
      if (truth == null || pred == null) continue;
      if (String(truth) === String(pred)) continue;

      // 记录错误
      if (!errorsByField.has(field.fieldKey)) {
        errorsByField.set(field.fieldKey, []);
      }
      errorsByField.get(field.fieldKey)!.push({
        sampleId: result.sampleId,
        runId: "", // runId 由调用方在持久化时补充
        originalValue: String(pred),
        correctedValue: String(truth)
      });
    }
  }

  // 生成纠偏候选
  for (const [fieldKey, errors] of errorsByField) {
    for (const err of errors) {
      const proposal: CorrectionProposal = {
        type: "correction",
        fieldKey,
        originalValue: err.originalValue,
        correctedValue: err.correctedValue
      };
      const evidence: RuleCandidateEvidence[] = [
        { runId: err.runId, sampleId: err.sampleId, fieldKey }
      ];
      drafts.push({
        schemaKey,
        fieldKey,
        ruleType: "correction",
        proposal,
        evidence,
        proposalHash: computeProposalHash(proposal)
      });
    }

    // 同字段 ≥2 条错误时生成规则候选
    if (errors.length >= 2) {
      const correctedValues = [...new Set(errors.map(e => e.correctedValue))];
      // 如果所有纠错目标值一致，生成规则
      if (correctedValues.length === 1) {
        const expectedValue = correctedValues[0];
        const originalValues = errors.map(e => e.originalValue);
        const condition = `当识别结果为 ${originalValues.join(" 或 ")} 时，应为 ${expectedValue}`;
        const proposal: RuleProposal = {
          type: "rule",
          fieldKey,
          condition,
          expectedValue,
          evidenceCount: errors.length
        };
        const evidence: RuleCandidateEvidence[] = errors.map(e => ({
          runId: e.runId,
          sampleId: e.sampleId,
          fieldKey
        }));
        drafts.push({
          schemaKey,
          fieldKey,
          ruleType: "rule",
          proposal,
          evidence,
          proposalHash: computeProposalHash(proposal)
        });
      }
    }
  }

  return drafts;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run packages/core/src/agents/evaluationAgent.test.ts --reporter=verbose
```
预期：4 个测试全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add packages/core/src/agents/evaluationAgent.ts packages/core/src/agents/evaluationAgent.test.ts
git commit -m "feat: EvaluationAgent 新增 generateCandidates 提炼逻辑"
```

---

## 任务 4：RuleCandidateRepository

**文件：**
- 创建：`apps/api/src/repositories/rule-candidate.repository.ts`
- 创建：`apps/api/src/repositories/rule-candidate.repository.test.ts`

- [ ] **步骤 1：编写仓库失败测试**

创建 `apps/api/src/repositories/rule-candidate.repository.test.ts`：

```typescript
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
    expect(items[0].fieldKey).toBe("sample_type");
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run apps/api/src/repositories/rule-candidate.repository.test.ts --reporter=verbose
```
预期：FAIL，`createRuleCandidateRepository is not a function`。

- [ ] **步骤 3：实现仓库**

创建 `apps/api/src/repositories/rule-candidate.repository.ts`：

```typescript
import type { PrismaClient, RuleCandidateStatus } from "@prisma/client";
import type {
  RuleCandidate,
  RuleCandidateProposal,
  RuleCandidateEvidence,
  RuleCandidateStatus as DomainStatus
} from "@medical-records/shared";

type RuleCandidateRepositoryDependencies = Pick<PrismaClient, "ruleCandidate">;

export interface CreateRuleCandidateInput {
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: RuleCandidateEvidence[];
  proposalHash: string;
}

function mapToDomain(row: any): RuleCandidate {
  return {
    id: row.id,
    schemaKey: row.schemaKey,
    fieldKey: row.fieldKey,
    ruleType: row.ruleType,
    proposal: row.proposal,
    evidence: row.evidence ?? [],
    status: row.status as DomainStatus,
    proposalHash: row.proposalHash ?? null,
    createdAt: row.createdAt?.toISOString() ?? "",
    decidedAt: row.decidedAt?.toISOString() ?? null
  };
}

export function createRuleCandidateRepository(dependencies: RuleCandidateRepositoryDependencies) {
  return {
    async create(input: CreateRuleCandidateInput): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.create({
        data: {
          schemaKey: input.schemaKey,
          fieldKey: input.fieldKey,
          ruleType: input.ruleType,
          proposal: input.proposal as any,
          evidence: input.evidence as any,
          proposalHash: input.proposalHash,
          status: "proposed" as RuleCandidateStatus
        }
      });
      return mapToDomain(row);
    },

    async findByField(schemaKey: string, fieldKey: string, status?: DomainStatus): Promise<RuleCandidate[]> {
      const rows = await dependencies.ruleCandidate.findMany({
        where: {
          schemaKey,
          fieldKey,
          ...(status ? { status: status as RuleCandidateStatus } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return rows.map(mapToDomain);
    },

    async findBySchema(schemaKey: string, status?: DomainStatus): Promise<RuleCandidate[]> {
      const rows = await dependencies.ruleCandidate.findMany({
        where: {
          schemaKey,
          ...(status ? { status: status as RuleCandidateStatus } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return rows.map(mapToDomain);
    },

    async findById(id: string): Promise<RuleCandidate | null> {
      const row = await dependencies.ruleCandidate.findUnique({ where: { id } });
      return row ? mapToDomain(row) : null;
    },

    async existsSimilar(schemaKey: string, fieldKey: string, proposalHash: string): Promise<boolean> {
      const count = await dependencies.ruleCandidate.count({
        where: {
          schemaKey,
          fieldKey,
          proposalHash,
          status: { in: ["proposed", "skipped"] as RuleCandidateStatus[] }
        }
      });
      return count > 0;
    },

    async updateStatus(id: string, status: DomainStatus): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.update({
        where: { id },
        data: {
          status: status as RuleCandidateStatus,
          decidedAt: new Date()
        }
      });
      return mapToDomain(row);
    },

    async updateProposal(id: string, proposal: RuleCandidateProposal, proposalHash: string): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.update({
        where: { id },
        data: {
          proposal: proposal as any,
          proposalHash
        }
      });
      return mapToDomain(row);
    }
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run apps/api/src/repositories/rule-candidate.repository.test.ts --reporter=verbose
```
预期：5 个测试全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add apps/api/src/repositories/rule-candidate.repository.ts apps/api/src/repositories/rule-candidate.repository.test.ts
git commit -m "feat: 新建 RuleCandidateRepository 含 CRUD 和去重检查"
```

---

## 任务 5：RuleCandidateService

**文件：**
- 创建：`apps/api/src/services/rule-candidate.service.ts`
- 创建：`apps/api/src/services/rule-candidate.service.test.ts`

- [ ] **步骤 1：编写服务失败测试**

创建 `apps/api/src/services/rule-candidate.service.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRuleCandidateService } from "./rule-candidate.service";
import type { RuleCandidateRepository } from "../repositories/rule-candidate.repository";
import type { KnowledgeRepository } from "../repositories/knowledge.repository";
import { generateCandidates } from "../../../packages/core/src/agents/evaluationAgent";
import type { EvaluationSampleResult } from "../../../packages/core/src/evaluation/metrics";

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
          dataset: { schemaKey: "test-schema" },
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
    })
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
      dataset: { schemaKey: "test-schema" },
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
    // 先创建一条候选
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
    // 模拟知识库写入失败
    (knowledgeRepo.create as any).mockRejectedValueOnce(new Error("DB_ERROR"));
    await expect(service.review(created.id, "accepted")).rejects.toMatchObject({ code: "KNOWLEDGE_WRITE_FAILED" });
    // 状态应回滚为 proposed
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
    // 添加 findLatestCompletedRun 到 evaluationRepo mock
    (evaluationRepo as any).findLatestCompletedRunBySchema = vi.fn(async (schemaKey: string) => ({
      id: "run-1",
      dataset: { schemaKey },
      result: { sampleResults: [
        {
          sampleId: "s1",
          status: "completed",
          latencyMs: 100,
          fieldResults: [
            { fieldKey: "sample_type", groundTruthValue: "外周血", predictedValue: "血清", normalizedGroundTruthValue: "外周血", normalizedPredictedValue: "血清" }
          ],
          warnings: []
        }
      ] }
    }));
    const result = await service.extractFromSchema("test-schema");
    expect(result.created).toBe(1);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run apps/api/src/services/rule-candidate.service.test.ts --reporter=verbose
```
预期：FAIL，`createRuleCandidateService is not a function`。

- [ ] **步骤 3：实现服务**

创建 `apps/api/src/services/rule-candidate.service.ts`：

```typescript
import { generateCandidates } from "../../../packages/core/src/agents/evaluationAgent";
import type { RuleCandidateRepository, CreateRuleCandidateInput } from "../repositories/rule-candidate.repository";
import type { KnowledgeRepository } from "../repositories/knowledge.repository";
import type { RuleCandidateProposal, RuleCandidateStatus } from "@medical-records/shared";
import type { EvaluationSampleResult } from "../../../packages/core/src/evaluation/metrics";

export interface RuleCandidateServiceDependencies {
  ruleCandidateRepository: RuleCandidateRepository;
  knowledgeRepository: KnowledgeRepository;
  evaluationRepository: {
    findRunById: (runId: string, actorUserId?: string) => Promise<any>;
    findLatestCompletedRunBySchema?: (schemaKey: string) => Promise<any>;
  };
}

export interface ReviewOptions {
  proposal?: RuleCandidateProposal;
  proposalHash?: string;
}

export interface ExtractResult {
  created: number;
  skipped: number;
}

export function createRuleCandidateService(deps: RuleCandidateServiceDependencies) {
  const { ruleCandidateRepository: repo, knowledgeRepository: knowledgeRepo, evaluationRepository: evalRepo } = deps;

  async function persistCandidates(drafts: ReturnType<typeof generateCandidates>, runId: string): Promise<ExtractResult> {
    let created = 0;
    let skipped = 0;
    for (const draft of drafts) {
      // 补充 runId 到 evidence
      const evidence = draft.evidence.map(e => ({ ...e, runId }));
      const exists = await repo.existsSimilar(draft.schemaKey, draft.fieldKey, draft.proposalHash);
      if (exists) {
        skipped++;
        continue;
      }
      await repo.create({
        schemaKey: draft.schemaKey,
        fieldKey: draft.fieldKey,
        ruleType: draft.ruleType,
        proposal: draft.proposal,
        evidence,
        proposalHash: draft.proposalHash
      });
      created++;
    }
    return { created, skipped };
  }

  return {
    async extractFromRun(runId: string): Promise<ExtractResult> {
      const run = await evalRepo.findRunById(runId);
      if (!run) {
        throw Object.assign(new Error("EVALUATION_RUN_NOT_FOUND"), { code: "EVALUATION_RUN_NOT_FOUND", statusCode: 404 });
      }
      const sampleResults: EvaluationSampleResult[] = run.result?.sampleResults ?? [];
      const schemaKey: string = run.dataset?.schemaKey ?? "";
      if (!schemaKey) {
        throw Object.assign(new Error("SCHEMA_KEY_MISSING"), { code: "SCHEMA_KEY_MISSING", statusCode: 400 });
      }
      const drafts = generateCandidates(sampleResults, schemaKey);
      return persistCandidates(drafts, runId);
    },

    async extractFromSchema(schemaKey: string): Promise<ExtractResult> {
      if (!evalRepo.findLatestCompletedRunBySchema) {
        throw Object.assign(new Error("NOT_SUPPORTED"), { code: "NOT_SUPPORTED", statusCode: 500 });
      }
      const run = await evalRepo.findLatestCompletedRunBySchema(schemaKey);
      if (!run) {
        return { created: 0, skipped: 0 };
      }
      const sampleResults: EvaluationSampleResult[] = run.result?.sampleResults ?? [];
      const drafts = generateCandidates(sampleResults, schemaKey);
      return persistCandidates(drafts, run.id);
    },

    async listByField(schemaKey: string, fieldKey: string, status?: RuleCandidateStatus) {
      return repo.findByField(schemaKey, fieldKey, status);
    },

    async review(candidateId: string, status: RuleCandidateStatus, options?: ReviewOptions) {
      const candidate = await repo.findById(candidateId);
      if (!candidate) {
        throw Object.assign(new Error("RULE_CANDIDATE_NOT_FOUND"), { code: "RULE_CANDIDATE_NOT_FOUND", statusCode: 404 });
      }

      // 编辑后接受：先更新 proposal
      if (options?.proposal && options?.proposalHash) {
        await repo.updateProposal(candidateId, options.proposal, options.proposalHash);
      }

      if (status === "accepted") {
        // 先标记为 accepted
        await repo.updateStatus(candidateId, "accepted");
        // 写入知识库
        try {
          const proposal = options?.proposal ?? candidate.proposal;
          const fieldKey = candidate.fieldKey;
          let title: string;
          let content: string;
          if (proposal.type === "correction") {
            title = `纠偏: ${fieldKey}`;
            content = `字段 "${fieldKey}" 从 "${proposal.originalValue}" 纠正为 "${proposal.correctedValue}"`;
          } else {
            title = `规则: ${fieldKey}`;
            content = `${proposal.condition}，期望值为 ${proposal.expectedValue}`;
          }
          await knowledgeRepo.create({
            kind: "field_description",
            title,
            content,
            keywords: [fieldKey],
            fieldKeys: [fieldKey],
            enabled: true,
            sortOrder: 0
          });
        } catch (err) {
          // 知识库写入失败，状态回滚
          await repo.updateStatus(candidateId, "proposed");
          throw Object.assign(new Error("KNOWLEDGE_WRITE_FAILED"), { code: "KNOWLEDGE_WRITE_FAILED", statusCode: 500 });
        }
        return repo.findById(candidateId);
      }

      // rejected / skipped：只更新状态
      return repo.updateStatus(candidateId, status);
    }
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run apps/api/src/services/rule-candidate.service.test.ts --reporter=verbose
```
预期：8 个测试全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add apps/api/src/services/rule-candidate.service.ts apps/api/src/services/rule-candidate.service.test.ts
git commit -m "feat: 新建 RuleCandidateService 含提炼编排和审核逻辑"
```

---

## 任务 6：EvaluationRepository 补充查询方法

**文件：**
- 修改：`apps/api/src/repositories/evaluation.repository.ts`

- [ ] **步骤 1：添加 findLatestCompletedRunBySchema 方法**

在 `apps/api/src/repositories/evaluation.repository.ts` 中，找到 `createEvaluationRepository` 返回对象，添加新方法：

```typescript
async findLatestCompletedRunBySchema(schemaKey: string) {
  const run = await dependencies.evaluationRun.findFirst({
    where: {
      status: "completed",
      dataset: { schemaKey }
    },
    include: {
      dataset: true
    },
    orderBy: { createdAt: "desc" }
  });
  if (!run) return null;
  // 需要获取运行结果中的 sampleResults
  // evaluationRun 表的 result 字段存储了完整运行结果
  return run;
}
```

注意：需要确认 `evaluationRun` 表是否包含 `result` 字段。如果不包含，需要通过 `evaluationMetric` 或单独的结果存储获取 sampleResults。根据现有代码，`EvaluationRunResult` 保存在 `evaluationRun.result` JSON 字段中（参考 `evaluation.repository.ts` 中 `createRun` 的实现）。

- [ ] **步骤 2：验证方法可用**

运行：
```bash
cd D:/02-Learning/agent && npx tsc --noEmit -p apps/api/tsconfig.json
```
预期：无类型错误。

- [ ] **步骤 3：Commit**

```bash
git add apps/api/src/repositories/evaluation.repository.ts
git commit -m "feat: EvaluationRepository 新增 findLatestCompletedRunBySchema"
```

---

## 任务 7：RuleCandidate 路由

**文件：**
- 创建：`apps/api/src/routes/rule-candidate.routes.ts`

- [ ] **步骤 1：实现路由**

创建 `apps/api/src/routes/rule-candidate.routes.ts`：

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RuleCandidateService } from "../services/rule-candidate.service";
import type { RuleCandidateStatus } from "@medical-records/shared";

export interface RuleCandidateRoutesDependencies {
  service: RuleCandidateService;
  authHooks: {
    authenticate: (request: any, reply: any) => Promise<void>;
    requirePermission: (permission: string) => (request: any, reply: any) => Promise<void>;
  };
}

const reviewBodySchema = z.object({
  status: z.enum(["accepted", "rejected", "skipped"]),
  proposal: z.any().optional(),
  proposalHash: z.string().optional()
});

export async function registerRuleCandidateRoutes(
  server: FastifyInstance,
  dependencies: RuleCandidateRoutesDependencies
) {
  const preHandler = [
    dependencies.authHooks.authenticate,
    dependencies.authHooks.requirePermission("schema:manage")
  ];

  // 按字段查询候选列表
  server.get<{ Params: { schemaKey: string; fieldKey: string } }>(
    "/schemas/:schemaKey/fields/:fieldKey/rule-candidates",
    { preHandler },
    async (request, reply) => {
      const { schemaKey, fieldKey } = request.params;
      const status = (request.query as any)?.status as RuleCandidateStatus | undefined;
      const items = await dependencies.service.listByField(schemaKey, fieldKey, status);
      return { items };
    }
  );

  // 审核候选
  server.patch<{ Params: { id: string } }>(
    "/rule-candidates/:id",
    { preHandler },
    async (request, reply) => {
      const parsed = reviewBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "BAD_REQUEST", details: parsed.error.issues });
      }
      const { id } = request.params;
      try {
        const result = await dependencies.service.review(id, parsed.data.status, {
          proposal: parsed.data.proposal,
          proposalHash: parsed.data.proposalHash
        });
        return result;
      } catch (err: any) {
        const statusCode = err.statusCode ?? 500;
        return reply.status(statusCode).send({ error: err.code ?? "INTERNAL_ERROR" });
      }
    }
  );

  // 手动触发提炼（按 schema，自动查找最新完成的运行）
  server.post<{ Params: { schemaKey: string } }>(
    "/schemas/:schemaKey/extract-candidates",
    { preHandler },
    async (request, reply) => {
      const { schemaKey } = request.params;
      try {
        const result = await dependencies.service.extractFromSchema(schemaKey);
        return result;
      } catch (err: any) {
        const statusCode = err.statusCode ?? 500;
        return reply.status(statusCode).send({ error: err.code ?? "INTERNAL_ERROR" });
      }
    }
  );
}
```

- [ ] **步骤 2：验证编译**

运行：
```bash
cd D:/02-Learning/agent && npx tsc --noEmit -p apps/api/tsconfig.json
```
预期：无类型错误。

- [ ] **步骤 3：Commit**

```bash
git add apps/api/src/routes/rule-candidate.routes.ts
git commit -m "feat: 新建 RuleCandidate 路由（查询/审核/手动提炼）"
```

---

## 任务 8：Production 装配 + 路由注册

**文件：**
- 修改：`apps/api/src/bootstrap/production-services.ts`
- 修改：`apps/api/src/server.ts`

- [ ] **步骤 1：在 production-services.ts 中装配 service**

在 `apps/api/src/bootstrap/production-services.ts` 中，找到 `createProductionApiServices` 函数，在创建其他仓库的位置添加：

```typescript
import { createRuleCandidateRepository } from "../repositories/rule-candidate.repository";
import { createRuleCandidateService } from "../services/rule-candidate.service";
```

在仓库创建区域添加：

```typescript
const ruleCandidateRepository = createRuleCandidateRepository(prisma);
```

在 service 创建区域添加：

```typescript
const ruleCandidateService = createRuleCandidateService({
  ruleCandidateRepository,
  knowledgeRepository,
  evaluationRepository: {
    findRunById: (runId: string) => evaluationRepository.findRunById(runId),
    findLatestCompletedRunBySchema: (schemaKey: string) => evaluationRepository.findLatestCompletedRunBySchema(schemaKey)
  }
});
```

在返回对象中添加 `ruleCandidateService`。

- [ ] **步骤 2：在评测运行完成后自动提炼**

在 `production-services.ts` 中找到评测运行创建的逻辑（`createProductionEvaluationRunner` 或 `evaluationService.createRun`），在运行完成后添加自动提炼调用：

```typescript
// 评测运行完成后自动提炼知识候选
try {
  await ruleCandidateService.extractFromRun(runId);
} catch {
  // 提炼失败不影响评测运行结果
}
```

注意：这段代码应放在运行结果保存之后。

- [ ] **步骤 3：在 server.ts 中注册路由**

在 `apps/api/src/server.ts` 中，找到路由注册区域，添加：

```typescript
import { registerRuleCandidateRoutes } from "./routes/rule-candidate.routes";
```

在注册其他路由的位置添加：

```typescript
if (options.services.ruleCandidateService) {
  await registerRuleCandidateRoutes(server, {
    service: options.services.ruleCandidateService,
    authHooks: options.authHooks!
  });
}
```

- [ ] **步骤 4：验证编译**

运行：
```bash
cd D:/02-Learning/agent && npx tsc --noEmit -p apps/api/tsconfig.json
```
预期：无类型错误。

- [ ] **步骤 5：Commit**

```bash
git add apps/api/src/bootstrap/production-services.ts apps/api/src/server.ts
git commit -m "feat: 装配 RuleCandidateService 并注册路由，评测完成后自动提炼"
```

---

## 任务 9：前端类型和 API 客户端

**文件：**
- 修改：`medical-ui/src/api/types.ts`
- 修改：`medical-ui/src/api/client.ts`

- [ ] **步骤 1：添加前端类型**

在 `medical-ui/src/api/types.ts` 中添加：

```typescript
export type RuleCandidateStatus = "proposed" | "accepted" | "rejected" | "skipped";

export interface CorrectionProposal {
  type: "correction";
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
}

export interface RuleProposal {
  type: "rule";
  fieldKey: string;
  condition: string;
  expectedValue: string;
  evidenceCount: number;
}

export type RuleCandidateProposal = CorrectionProposal | RuleProposal;

export interface RuleCandidateEvidence {
  runId: string;
  sampleId: string;
  fieldKey: string;
}

export interface RuleCandidate {
  id: string;
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: RuleCandidateEvidence[];
  status: RuleCandidateStatus;
  proposalHash: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ExtractResult {
  created: number;
  skipped: number;
}
```

- [ ] **步骤 2：添加 API 客户端方法**

在 `medical-ui/src/api/client.ts` 中添加：

```typescript
export const ruleCandidateApi = {
  listByField: (schemaKey: string, fieldKey: string, status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const query = params.toString();
    return request<{ items: RuleCandidate[] }>(
      `/schemas/${schemaKey}/fields/${fieldKey}/rule-candidates${query ? "?" + query : ""}`
    );
  },

  review: (id: string, body: {
    status: "accepted" | "rejected" | "skipped";
    proposal?: RuleCandidateProposal;
    proposalHash?: string;
  }) => request<RuleCandidate>(`/rule-candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  }),

  extract: (schemaKey: string) => request<ExtractResult>(
    `/schemas/${schemaKey}/extract-candidates`,
    { method: "POST" }
  )
};
```

确保在文件顶部的 import 中加入新类型：`RuleCandidate`, `RuleCandidateProposal`, `ExtractResult`。

- [ ] **步骤 3：验证编译**

运行：
```bash
cd D:/02-Learning/agent/medical-ui && npx tsc --noEmit
```
预期：无类型错误。

- [ ] **步骤 4：Commit**

```bash
git add medical-ui/src/api/types.ts medical-ui/src/api/client.ts
git commit -m "feat: 前端新增 RuleCandidate 类型和 API 客户端"
```

---

## 任务 10：前端 useRuleCandidates Hook

**文件：**
- 创建：`medical-ui/src/hooks/useRuleCandidates.ts`

- [ ] **步骤 1：实现 hook**

创建 `medical-ui/src/hooks/useRuleCandidates.ts`：

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ruleCandidateApi } from "../api/client";
import type { RuleCandidateProposal, RuleCandidateStatus } from "../api/types";
import { toast } from "../components/GlobalToast";

export function useRuleCandidates(schemaKey: string | undefined, fieldKey: string | undefined) {
  return useQuery({
    queryKey: ["rule-candidates", schemaKey, fieldKey],
    queryFn: () => ruleCandidateApi.listByField(schemaKey!, fieldKey!),
    enabled: !!schemaKey && !!fieldKey,
    staleTime: 30_000,
  });
}

export function useReviewCandidate(schemaKey: string, fieldKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      status: RuleCandidateStatus;
      proposal?: RuleCandidateProposal;
      proposalHash?: string;
    }) => ruleCandidateApi.review(vars.id, {
      status: vars.status as "accepted" | "rejected" | "skipped",
      proposal: vars.proposal,
      proposalHash: vars.proposalHash
    }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["rule-candidates", schemaKey, fieldKey] });
      const messages: Record<string, string> = {
        accepted: "已接受，写入知识库",
        rejected: "已拒绝",
        skipped: "已跳过",
      };
      toast.success(messages[vars.status] ?? "操作完成");
    },
    onError: () => {
      // request 函数已自动 toast，这里无需重复
    },
  });
}

export function useExtractCandidates(schemaKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ruleCandidateApi.extract(schemaKey),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rule-candidates", schemaKey] });
      if (data.created === 0 && data.skipped === 0) {
        toast.info("无错误样本，未生成候选");
      } else {
        toast.success(`生成 ${data.created} 条候选${data.skipped > 0 ? `，跳过 ${data.skipped} 条重复` : ""}`);
      }
    },
  });
}
```

- [ ] **步骤 2：验证编译**

运行：
```bash
cd D:/02-Learning/agent/medical-ui && npx tsc --noEmit
```
预期：无类型错误。

- [ ] **步骤 3：Commit**

```bash
git add medical-ui/src/hooks/useRuleCandidates.ts
git commit -m "feat: 新增 useRuleCandidates / useReviewCandidate / useExtractCandidates hooks"
```

---

## 任务 11：RuleCandidateList 组件

**文件：**
- 创建：`medical-ui/src/components/RuleCandidateList.tsx`

- [ ] **步骤 1：实现组件**

创建 `medical-ui/src/components/RuleCandidateList.tsx`：

```tsx
import { useState } from "react";
import { Button, Tag, Space, Input, Typography, Collapse, Empty } from "@arco-design/web-react";
import { IconCheck, IconClose, IconEdit, IconMinus, IconRefresh } from "@arco-design/web-react/icon";
import type { RuleCandidate, RuleCandidateProposal } from "../api/types";
import { useReviewCandidate, useExtractCandidates } from "../hooks/useRuleCandidates";

interface RuleCandidateListProps {
  schemaKey: string;
  fieldKey: string;
}

function proposalSummary(proposal: RuleCandidateProposal): string {
  if (proposal.type === "correction") {
    return `"${proposal.originalValue}" → "${proposal.correctedValue}"`;
  }
  return `${proposal.condition}，期望: ${proposal.expectedValue}`;
}

function CandidateItem({
  candidate,
  schemaKey,
  fieldKey,
}: {
  candidate: RuleCandidate;
  schemaKey: string;
  fieldKey: string;
}) {
  const reviewMutation = useReviewCandidate(schemaKey, fieldKey);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const isProposed = candidate.status === "proposed" || candidate.status === "skipped";

  const handleEditAccept = () => {
    // 编辑后接受：仅支持修改规则描述或纠偏值
    let proposal = candidate.proposal;
    if (editText.trim()) {
      if (proposal.type === "correction") {
        proposal = { ...proposal, correctedValue: editText.trim() };
      } else {
        proposal = { ...proposal, condition: editText.trim() };
      }
    }
    reviewMutation.mutate({
      id: candidate.id,
      status: "accepted",
      proposal,
      proposalHash: undefined, // 让后端重新计算或保持原值
    });
    setEditing(false);
  };

  if (!isProposed) {
    // accepted/rejected 折叠在历史中
    return (
      <div style={{ padding: "8px 12px", opacity: 0.6 }}>
        <Tag color={candidate.status === "accepted" ? "green" : "red"} size="small">
          {candidate.status === "accepted" ? "已接受" : "已拒绝"}
        </Tag>
        <span style={{ marginLeft: 8, fontSize: 13 }}>
          [{candidate.ruleType === "correction" ? "纠偏" : "规则"}] {proposalSummary(candidate.proposal)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space size={8}>
          <Tag color={candidate.ruleType === "correction" ? "blue" : "purple"} size="small">
            {candidate.ruleType === "correction" ? "纠偏" : "规则"}
          </Tag>
          {candidate.status === "skipped" && <Tag color="gray" size="small">已跳过</Tag>}
          <Typography.Text style={{ fontSize: 13 }}>
            {proposalSummary(candidate.proposal)}
          </Typography.Text>
        </Space>
        <Space size={4}>
          <Button
            size="mini"
            type="text"
            icon={<IconEdit />}
            onClick={() => {
              setEditing(true);
              setEditText(candidate.proposal.type === "correction" ? candidate.proposal.correctedValue : candidate.proposal.condition);
            }}
          />
          <Button
            size="mini"
            type="text"
            status="success"
            icon={<IconCheck />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "accepted" })}
          />
          <Button
            size="mini"
            type="text"
            status="danger"
            icon={<IconClose />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "rejected" })}
          />
          <Button
            size="mini"
            type="text"
            icon={<IconMinus />}
            loading={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ id: candidate.id, status: "skipped" })}
          />
        </Space>
      </div>
      {editing && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <Input
            size="small"
            value={editText}
            onChange={setEditText}
            placeholder="编辑候选内容"
          />
          <Button size="small" type="primary" onClick={handleEditAccept}>保存并接受</Button>
          <Button size="small" onClick={() => setEditing(false)}>取消</Button>
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-3)" }}>
        证据: {candidate.evidence.length} 条
      </div>
    </div>
  );
}

export default function RuleCandidateList({ schemaKey, fieldKey }: RuleCandidateListProps) {
  const { data, isLoading } = useRuleCandidates(schemaKey, fieldKey);
  const extractMutation = useExtractCandidates(schemaKey);

  const candidates = data?.items ?? [];
  const activeCandidates = candidates.filter(c => c.status === "proposed" || c.status === "skipped");
  const historyCandidates = candidates.filter(c => c.status === "accepted" || c.status === "rejected");

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          知识候选 ({activeCandidates.length})
        </Typography.Text>
        <Button
          size="mini"
          type="text"
          icon={<IconRefresh />}
          loading={extractMutation.isPending}
          onClick={() => extractMutation.mutate()}
        >
          提炼
        </Button>
      </div>

      {isLoading ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>加载中...</Typography.Text>
      ) : activeCandidates.length === 0 && historyCandidates.length === 0 ? (
        <Empty description="暂无知识候选" />
      ) : (
        <>
          {activeCandidates.map(c => (
            <CandidateItem key={c.id} candidate={c} schemaKey={schemaKey} fieldKey={fieldKey} />
          ))}
          {historyCandidates.length > 0 && (
            <Collapse style={{ marginTop: 8 }}>
              <Collapse.Item name="history" header={`历史记录 (${historyCandidates.length})`}>
                {historyCandidates.map(c => (
                  <CandidateItem key={c.id} candidate={c} schemaKey={schemaKey} fieldKey={fieldKey} />
                ))}
              </Collapse.Item>
            </Collapse>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：验证编译**

运行：
```bash
cd D:/02-Learning/agent/medical-ui && npx tsc --noEmit
```
预期：无类型错误。

- [ ] **步骤 3：Commit**

```bash
git add medical-ui/src/components/RuleCandidateList.tsx
git commit -m "feat: 新增 RuleCandidateList 组件，支持审核/编辑/提炼"
```

---

## 任务 12：FieldCard 集成

**文件：**
- 修改：`medical-ui/src/components/FieldCard.tsx`

- [ ] **步骤 1：在 FieldCard 中嵌入 RuleCandidateList**

在 `medical-ui/src/components/FieldCard.tsx` 中：

1. 顶部添加 import：

```typescript
import RuleCandidateList from "./RuleCandidateList";
```

2. 找到组件 props 接口，添加 `schemaKey`：

```typescript
interface FieldCardProps {
  field: SchemaField;
  stats?: FieldStatItem;
  schemaKey: string;  // 新增
  onUpdate: (key: string, updates: Partial<SchemaField>) => void;
}
```

3. 在卡片渲染中，找到"识别统计"区域后面，用 `Divider` 分隔后添加"知识候选"区域：

```tsx
<Divider />
<div>
  <RuleCandidateList schemaKey={schemaKey} fieldKey={field.key} />
</div>
```

- [ ] **步骤 2：更新 SchemaPage 传递 schemaKey**

在 `medical-ui/src/pages/SchemaPage.tsx` 第 718-724 行，给 FieldCard 传递 schemaKey：

```tsx
<FieldCard
  field={field}
  stats={statsMap.get(field.key)}
  schemaKey={selected.schemaKey}
  onUpdate={handleFieldUpdate}
/>
```

- [ ] **步骤 3：验证编译**

运行：
```bash
cd D:/02-Learning/agent/medical-ui && npx tsc --noEmit
```
预期：无类型错误。

- [ ] **步骤 4：Commit**

```bash
git add medical-ui/src/components/FieldCard.tsx medical-ui/src/pages/SchemaPage.tsx
git commit -m "feat: FieldCard 嵌入知识候选列表，SchemaPage 传递 schemaKey"
```

---

## 任务 13：端到端验证

- [ ] **步骤 1：运行全部后端测试**

运行：
```bash
cd D:/02-Learning/agent && npx vitest run --reporter=verbose
```
预期：所有测试 PASS。

- [ ] **步骤 2：前端构建检查**

运行：
```bash
cd D:/02-Learning/agent/medical-ui && npm run build
```
预期：构建成功，无类型错误。

- [ ] **步骤 3：启动后端服务验证路由注册**

运行：
```bash
cd D:/02-Learning/agent && npx tsx apps/api/src/server.ts &
sleep 3
curl -s http://localhost:3000/api/schemas/test/fields/sample_type/rule-candidates -H "Authorization: Bearer test" | head -c 200
kill %1
```
预期：返回 JSON（可能是空列表或 401），不返回 404。

- [ ] **步骤 4：Commit 最终状态**

```bash
git add -A
git commit -m "feat: 评测错误提炼知识候选功能完成"
```
