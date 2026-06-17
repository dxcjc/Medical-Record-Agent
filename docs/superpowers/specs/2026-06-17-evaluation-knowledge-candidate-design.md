# 评测错误提炼知识候选 — 设计规格

## 背景

原始设计（`docs/architecture/system-architecture.md`）描述了"反馈/评测错误 → 规则候选（RuleCandidate）→ 人工审核 → 知识库"的完整闭环。当前实现退化为：评测中心只算统计指标，不从错误中提炼任何内容；`RuleCandidate` 表/类型/fixture 已预留但无 API、Service、Repository 和前端界面。

本设计恢复评测错误路径：从评测运行的错误样本中提炼知识候选，用户在 Schema 详情页字段卡片中审核，决定是否写入知识库。

## 范围

- 评测错误提炼（人工反馈直接写库的路径保持现状）
- 候选生成：自动（评测结束）+ 手动（用户点提炼按钮）
- 候选内容：单条纠偏记录 + 多条聚合的结构化规则
- 候选审核：接受 / 拒绝 / 编辑后接受 / 跳过
- 审核界面：Schema 详情页字段卡片内

## 数据流

```
评测运行结束
  → EvaluationAgent 分析错误样本
    → 单条错误 → 生成纠偏记录候选 (field_description 类型草稿)
    → 同字段多次错误 → 聚合生成结构化规则候选 (带条件判断的规则草案)
  → 候选写入 RuleCandidate 表 (status: proposed)

用户手动触发"提炼知识候选"
  → 调用同一提炼逻辑，可能补充已有候选或生成新的

用户在 Schema 详情页字段卡片审核
  → 每条候选可操作：接受 / 拒绝 / 编辑后接受 / 跳过
    → 接受/编辑后接受 → 写入知识库 (knowledgeRepository.create)
    → 拒绝 → status: rejected
    → 跳过 → status: skipped，留在候选池
```

## 候选数据结构

`RuleCandidate.proposal` 存 JSON，两种形态：

- 纠偏记录：`{ type: "correction", fieldKey, originalValue, correctedValue }`
- 结构化规则：`{ type: "rule", fieldKey, condition, expectedValue, evidenceCount }`

`evidence` 存证据样本 ID 列表，可追溯到具体评测运行和样本。

去重：用 `fieldKey + type + 核心内容` 做 hash 计算 proposalHash。核心内容定义：
- correction 类型：`fieldKey + originalValue + correctedValue`
- rule 类型：`fieldKey + condition + expectedValue`

同字段已有相同 proposalHash 的 proposed/skipped 候选时不重复生成。

## 后端组件

### EvaluationAgent 扩展

现有 `packages/core/src/agents/evaluationAgent.ts` 只产出 `EvaluationSampleCandidate`。扩展为同时产出 `RuleCandidate[]`：

```typescript
export interface EvaluationAgentResult {
  sampleCandidate: EvaluationSampleCandidate;
  ruleCandidates: RuleCandidate[];      // 新增
  excludedFieldKeys: string[];
}
```

提炼逻辑分两步：
1. **遍历错误样本** — 对每个 prediction != ground truth 的字段，对比 ground truth 和 prediction，生成纠偏记录候选
2. **按字段聚合** — 同一 fieldKey 下累积 ≥2 条纠偏候选时，归纳出结构化规则候选（提取共同模式，如"OCR 块包含 X 时，字段应为 Y"）

### RuleCandidateRepository（新建）

路径：`apps/api/src/repositories/rule-candidate.repository.ts`

CRUD 操作：
- `create(data)` — 创建候选
- `findBySchema(schemaKey, filters?)` — 按 schema 查询候选列表，支持 status 过滤
- `findByField(schemaKey, fieldKey)` — 按字段查询（字段卡片用）
- `update(id, { status, proposal })` — 更新状态/内容
- `existsSimilar(schemaKey, fieldKey, proposalHash)` — 去重检查

### RuleCandidate 路由（新建）

路径：`apps/api/src/routes/rule-candidate.routes.ts`

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/schemas/:schemaKey/fields/:fieldKey/rule-candidates` | 字段卡片拉取候选列表 |
| PATCH | `/api/rule-candidates/:id` | 审核（接受/拒绝/跳过/编辑） |
| POST | `/api/evaluation-runs/:runId/extract-candidates` | 手动触发提炼 |

### 手动触发

评测运行结果已存库，手动触发时从 `evaluationRunResult.sampleResults` 重新读取错误样本，走同一提炼逻辑，去重后补充新候选。

### 接受候选时的知识库写入

接受的候选调用 `knowledgeRepository.create()` 写入知识库，kind 为 `field_description`。写库失败时候选状态回滚为 proposed，返回错误提示重试。

## 前端组件

### FieldCard 扩展

现有 `medical-ui/src/components/FieldCard.tsx` 展示字段统计。在卡片底部增加"知识候选"区域：

```
┌─ FieldCard: sample_type ─────────────────────┐
│ 识别次数: 120    平均置信度: 0.87    复核: 8  │
│ 纠错: 5 次                                      │
├─────────────────────────────────────────────────┤
│ 知识候选 (2)                          [提炼]  │
│ ┌─────────────────────────────────────────────┐ │
│ │ [纠偏] sample_type: "外周血" → "外周血"    │ │
│ │ 证据: 3 条  | [编辑] [接受] [拒绝] [跳过]  │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ [规则] 当 OCR 包含"样本类型：外周血"时...  │ │
│ │ 证据: 5 条  | [编辑] [接受] [拒绝] [跳过]  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

- 候选列表通过 `GET /api/schemas/:schemaKey/fields/:fieldKey/rule-candidates` 拉取
- **[提炼]** 按钮调用 `POST /api/evaluation-runs/:runId/extract-candidates`，刷新当前字段候选列表
- **[编辑]** 弹出内联编辑区，用户修改 proposal 内容后保存为 proposed 状态
- **[接受]** 调用 PATCH 设 status: accepted，后端同步写入知识库
- **[拒绝]** 调用 PATCH 设 status: rejected
- **[跳过]** 调用 PATCH 设 status: skipped

### 候选展示状态

- proposed / skipped：显示在候选列表，可操作
- accepted/rejected：默认折叠隐藏，可展开查看历史

## 数据模型变更

### RuleCandidateStatus 枚举

从 `proposed | accepted | rejected` 扩展为 `proposed | accepted | rejected | skipped`。对应 Prisma enum 和 `packages/shared/src/types.ts` 同步更新。

### RuleCandidate 表

现有 Prisma 模型无需新增字段，`proposal` (Json) 和 `evidence` (Json) 已满足存储需求。新增 `proposalHash` 字段用于去重：

```prisma
model RuleCandidate {
  // ... 现有字段
  proposalHash String?  // 新增，用于去重
  @@index([schemaKey, fieldKey, proposalHash])  // 新增联合索引
}
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 提炼时无错误样本 | 返回空数组，不报错，前端提示"无错误样本，未生成候选" |
| 知识库写入失败（接受候选时） | 候选状态回滚为 proposed，返回错误给前端，提示重试 |
| 手动触发但评测运行不存在 | 返回 404 |
| 去重时 proposalHash 计算 | correction: `fieldKey + originalValue + correctedValue`；rule: `fieldKey + condition + expectedValue` |
| 并发审核同一条候选 | 用 `updatedAt` 做乐观锁，并发更新返回 409 |

## 测试

### 后端单元测试

- `evaluationAgent` 提炼逻辑：单条错误生成纠偏候选、多条同类错误聚合规则候选、无错误返回空
- `rule-candidate.repository` CRUD + 去重检查
- 审核操作：接受时写知识库、拒绝不改库、跳过保持原状、编辑后接受

### 后端集成测试

- 评测运行结束 → 候选自动生成 → 查询接口返回候选
- 手动触发 → 候选补充 → 去重生效
- 接受候选 → 知识库出现对应条目 → 候选状态变 accepted

### 前端测试

- FieldCard 候选列表渲染、四种操作交互
- 编辑模式切换、保存/取消
- 提炼按钮加载态和结果刷新
