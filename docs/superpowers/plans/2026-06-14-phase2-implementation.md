# Phase 2 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现 4 个 Phase 2 任务：Schema 字段卡片编辑器、识别统计聚合 API、JobDetailPage 动态化、CheckboxMatrix 高亮优化。

**架构：** 后端新增 stats 路由层（Fastify）+ Prisma 聚合查询；前端将 SchemaPage 从 Table 改为卡片流、JobDetailPage 从硬编码改为从 Schema definition 动态生成、CheckboxMatrix 样式增强。遵循现有 monorepo 模式：routes → services → repositories。

**技术栈：** Fastify、Prisma、React 19、Arco Design、TanStack Query、Vite

---

## 文件结构

### 后端新增
- `apps/api/src/routes/stats.routes.ts` — 字段识别统计 API 路由
- `apps/api/src/services/stats.service.ts` — 统计聚合业务逻辑

### 后端修改
- `apps/api/src/server.ts` — 注册 stats 路由
- `apps/api/src/repositories/results.repository.ts` — 新增 findBySchemaKey 聚合方法
- `apps/api/src/repositories/feedback.repository.ts` — 新增 listBySchemaKey 方法

### 前端新增
- `medical-ui/src/components/FieldCard.tsx` — 字段卡片编辑器组件
- `medical-ui/src/hooks/useFieldStats.ts` — 字段统计 hook
- `medical-ui/src/hooks/useKnowledge.ts` — Knowledge CRUD hook
- `medical-ui/src/utils/schemaGroups.ts` — Schema 字段分组工具函数

### 前端修改
- `medical-ui/src/pages/SchemaPage.tsx` — 重写为卡片流布局
- `medical-ui/src/pages/JobDetailPage.tsx` — 去硬编码，动态化
- `medical-ui/src/components/CheckboxMatrix.tsx` — 高亮优化
- `medical-ui/src/api/client.ts` — 新增 stats API 客户端
- `medical-ui/src/api/types.ts` — 新增 FieldStats 类型

---

## 任务 1：识别统计聚合 API（后端先行）

### 步骤 1：编写 stats 路由测试

**文件：**
- 创建：`apps/api/src/routes/stats.routes.test.ts`

```typescript
import { describe, expect, it, vi } from "vitest";
import { createApiServer, type ApiServerServices } from "../server";

function createMinimalServices(overrides: Partial<ApiServerServices> = {}): ApiServerServices {
  const authCtx = {
    actorUserId: "user-001",
    authType: "jwt" as const,
    permissions: ["schema:read", "job:read"],
    roles: ["operator"]
  };
  return {
    authService: {
      login: vi.fn(async () => ({ accessToken: "t", tokenType: "Bearer", user: { id: "u", email: "e", displayName: "d" }, permissions: [], roles: [] })),
      authenticateJwt: vi.fn(async () => authCtx),
      authenticateApiToken: vi.fn(async () => authCtx),
      isSessionTokenInvalidated: vi.fn(() => false),
      invalidateSessionToken: vi.fn(async () => undefined),
      describeSessionInvalidationStore: vi.fn(() => undefined),
      requirePermission: vi.fn(),
    },
    auditService: { listRecent: vi.fn(async () => []), record: vi.fn(async () => undefined) },
    schemaService: { listActive: vi.fn(async () => []), createDraft: vi.fn(async () => ({})), updateDraft: vi.fn(async () => ({})), validateDraft: vi.fn(async () => ({})), publishDraft: vi.fn(async () => ({})), deactivateVersion: vi.fn(async () => ({})), rollbackVersion: vi.fn(async () => ({})), compareVersions: vi.fn(async () => ({})) },
    fileService: { createUpload: vi.fn(async () => ({})), getContent: vi.fn(async () => null) },
    jobService: { create: vi.fn(async () => ({})), get: vi.fn(async () => null), list: vi.fn(async () => []), listPaginated: vi.fn(async () => ({ items: [], total: 0 })), softDelete: vi.fn(async () => undefined), rerun: vi.fn(async () => ({})) },
    resultService: { getByJobId: vi.fn(async () => null) },
    feedbackService: { create: vi.fn(async () => ({})), listByJobId: vi.fn(async () => []) },
    writebackService: { listEligible: vi.fn(async () => []), execute: vi.fn(async () => ({})) },
    providerService: { listProviders: vi.fn(async () => []), saveProviderConfig: vi.fn(async () => ({})), setDefaultProvider: vi.fn(async () => ({})), checkProviderHealth: vi.fn(async () => ({})) },
    evaluationService: { listDatasets: vi.fn(async () => []), createDataset: vi.fn(async () => ({})), listRuns: vi.fn(async () => []), createRun: vi.fn(async () => ({})), getRun: vi.fn(async () => ({})), listRunMetrics: vi.fn(async () => []) },
    knowledgeService: { knowledgeRepository: { list: vi.fn(async () => []), getById: vi.fn(async () => null), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => undefined), count: vi.fn(async () => 0) } },
    ...overrides,
  };
}

describe("GET /api/stats/fields", () => {
  it("should return 400 when schemaKey is missing", async () => {
    const statsService = {
      getFieldStats: vi.fn(async () => []),
    };
    const server = await createApiServer({
      services: createMinimalServices({ statsService } as any),
      logger: false,
    });
    const res = await server.inject({ method: "GET", url: "/api/stats/fields" });
    expect(res.statusCode).toBe(400);
  });

  it("should return field stats for valid schemaKey", async () => {
    const mockStats = [
      {
        fieldKey: "patientName",
        recognitionCount: 10,
        avgConfidence: 0.85,
        reviewCount: 2,
        correctionCount: 1,
        commonErrors: [{ original: "张三丰", corrected: "张三", count: 1 }],
      },
    ];
    const statsService = {
      getFieldStats: vi.fn(async () => mockStats),
    };
    const server = await createApiServer({
      services: createMinimalServices({ statsService } as any),
      logger: false,
    });
    const res = await server.inject({
      method: "GET",
      url: "/api/stats/fields?schemaKey=tumor-gene-test",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.stats).toHaveLength(1);
    expect(body.stats[0].fieldKey).toBe("patientName");
    expect(body.stats[0].recognitionCount).toBe(10);
  });
});
```

- [ ] **步骤 1a：运行测试验证失败**

运行：`cd /tmp/Medical-Record-Agent && npx vitest run apps/api/src/routes/stats.routes.test.ts --reporter=verbose 2>&1 | tail -20`
预期：FAIL，statsService 相关错误

### 步骤 2：实现 stats.service.ts

**文件：**
- 创建：`apps/api/src/services/stats.service.ts`

```typescript
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
        const origStr = JSON.stringify(fb.originalValue ?? "");
        const corrStr = JSON.stringify(fb.correctedValue ?? "");
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
          avgConfidence: data.confidenceCount > 0 ? Math.round((data.totalConfidence / data.confidenceCount) * 10000) / 10000 : null,
          reviewCount: data.reviewCount,
          correctionCount: correction?.count ?? 0,
          commonErrors,
        });
      }

      return stats.sort((a, b) => b.recognitionCount - a.recognitionCount);
    },
  };
}
```

### 步骤 3：实现 stats.routes.ts

**文件：**
- 创建：`apps/api/src/routes/stats.routes.ts`

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FieldStatItem } from "../services/stats.service";

export interface StatsRouteService {
  getFieldStats(schemaKey: string, limit?: number): Promise<FieldStatItem[]>;
}

export function registerStatsRoutes(
  app: FastifyInstance,
  service: StatsRouteService,
  authHook?: any
) {
  app.get("/api/stats/fields", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { schemaKey?: string; limit?: string };
    if (!query.schemaKey) {
      return reply.status(400).send({ error: "MISSING_PARAM", message: "schemaKey is required" });
    }
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 100, 500) : 100;
    const stats = await service.getFieldStats(query.schemaKey, limit);
    return reply.send({ stats, total: stats.length });
  });
}
```

### 步骤 4：注册路由 + 接线到 server.ts

**文件：**
- 修改：`apps/api/src/server.ts` — import 并注册 stats 路由
- 修改：`apps/api/src/services/api-services.ts` — 创建 statsService 实例

### 步骤 5：运行测试验证通过

运行：`cd /tmp/Medical-Record-Agent && npx vitest run apps/api/src/routes/stats.routes.test.ts`
预期：PASS

---

## 任务 2：Schema 字段卡片编辑器

### 步骤 1：创建 schemaGroups 工具函数

**文件：**
- 创建：`medical-ui/src/utils/schemaGroups.ts`

从 Schema definition 的 fields 数组按 key 前缀/业务归属分组。分组规则：
- 患者信息：patientName, patientGender, patientAge, outpatientNo, phone, idNumber, ethnicity
- 送检信息：referringDoctor, referralDate, pathologyNo, sampleNo, clinicRoom
- 临床诊断：tumorType, tumorCategory
- 样本信息：sampleType, bloodSample, samplePrepTime, tumorCellPercent
- 检测项目：testItemsLung, testItemsGI, testItemsOther
- 检测产品：testProvider, documentNo, documentVersion
- 其他：transfusionHistory 等未分类字段

### 步骤 2：创建 useFieldStats hook

**文件：**
- 创建：`medical-ui/src/hooks/useFieldStats.ts`

调用 `GET /api/stats/fields?schemaKey=xxx`，返回 `FieldStatItem[]`。

### 步骤 3：创建 useKnowledge hook

**文件：**
- 创建：`medical-ui/src/hooks/useKnowledge.ts`

封装 knowledgeApi 的 list/create/update/delete，支持 fieldKey 过滤。

### 步骤 4：新增 stats API 客户端

**文件：**
- 修改：`medical-ui/src/api/client.ts` — 新增 `statsApi.getFieldStats`
- 修改：`medical-ui/src/api/types.ts` — 新增 `FieldStatItem` 类型

### 步骤 5：创建 FieldCard 组件

**文件：**
- 创建：`medical-ui/src/components/FieldCard.tsx`

每个字段一张卡片，包含：
- 字段头：label + key + 必填/关键标签
- 属性区域（inline 编辑）：标签 Input、类型 Select、LIMS 映射 Input、识别说明 Textarea、枚举值编辑（enumMap 类型时显示）、写回模式 Select
- 关联知识区域：显示该 fieldKey 的 KnowledgeEntry 列表，支持 inline 增删改
- 识别统计区域：显示识别次数、置信度均值、需复核次数、常见错误模式

### 步骤 6：重写 SchemaPage

**文件：**
- 修改：`medical-ui/src/pages/SchemaPage.tsx`

- 左侧栏保持不变
- 右侧改为：
  - 顶部 Schema 信息 + 操作按钮不变
  - 字段定义区域改为按分组显示的卡片流
  - 每组一个标题（如"患者信息"），下面是 FieldCard 卡片
  - 卡片属性修改 → 更新本地 state → 保存按钮更新 Schema definition JSON

---

## 任务 3：JobDetailPage 动态化

### 步骤 1：从 Schema definition 动态构建字段分组

**文件：**
- 修改：`medical-ui/src/pages/JobDetailPage.tsx`

1. 用 `useSchemas()` 获取 Schema 列表
2. 根据 `job.schemaKey` 匹配对应的 SchemaVersion
3. 从 `definition.fields` 动态构建 FIELD_GROUPS 和 FIELD_LABELS
4. 从 `definition.fields` 中 `type === 'list'` 的字段提取 enumOptions
5. 保留 `getFieldData()` 函数，但使用动态 FIELD_LABELS
6. CheckboxMatrix 使用动态 enumOptions

### 步骤 2：类型检查和构建验证

运行：`cd /tmp/Medical-Record-Agent && pnpm typecheck`
运行：`cd /tmp/Medical-Record-Agent/medical-ui && pnpm build`

---

## 任务 4：CheckboxMatrix 高亮优化

### 步骤 1：修改 CheckboxMatrix 样式

**文件：**
- 修改：`medical-ui/src/components/CheckboxMatrix.tsx`

变更：
1. gap: 8 → 12
2. 未选中项添加 ☐ 图标（IconCheck 替换为条件渲染）
3. 选中项添加 transform: scale(1.02) + transition 动画
4. 确认已有样式：选中=#3370FF 白字 ☑ 粗体蓝边框，未选中=#F7F8FA 灰字 灰边框

---

## 全局验证

1. `pnpm typecheck` — TypeScript 类型检查
2. `cd medical-ui && pnpm build` — 前端构建
3. 运行后端测试：`npx vitest run apps/api/src/routes/stats.routes.test.ts`
4. 写入审计报告：`PHASE2-AUDIT.md`
