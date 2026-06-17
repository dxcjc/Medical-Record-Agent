# Medical Record Agent 架构优化 V2

> **优化日期**: 2026-06-17
> **架构版本**: V2
> **优化目标**: 提升多智能体协作能力、增强工作流灵活性、支持反馈循环

---

## 一、优化概述

基于对现有架构的深入分析，本次优化解决了以下核心问题：

1. **RAG 集成位置不合理** - 从 Agent 内部提升为独立节点
2. **Visual Review 状态污染** - 分离原始抽取结果与视觉增强结果
3. **缺少动态路径规划** - 引入 Supervisor Agent 实现策略决策
4. **无反馈循环机制** - 支持 Validation → Extraction 的智能重试
5. **多轮抽取逻辑耦合** - 从 Agent 内部迁移到 Workflow 层
6. **Agent 间缺少协作** - 新增冲突解决节点处理 Visual 与 Extraction 差异

---

## 二、新增组件

### 2.1 Supervisor Agent（策略决策者）

**职责**: 根据文档特征、Schema 复杂度、OCR 质量等因素，动态决策执行策略。

**核心能力**:
- 支持 4 种执行策略：`full`、`fast`、`visual-priority`、`extraction-only`
- 自动调整置信度阈值和最大重试次数
- 根据文档类型（表格/表单）选择最优路径

**决策规则示例**:
```typescript
// 规则 1：无图片时跳过 Visual Review
if (!hasImage) {
  enableVisualReview = false;
}

// 规则 2：高优先级任务降低阈值、增加重试
if (jobPriority === "high") {
  confidenceThreshold = 0.2;
  maxRetryRounds = 3;
}

// 规则 3：OCR 质量极高时跳过 Visual Review
if (ocrResult.confidence > 0.95) {
  enableVisualReview = false;
}
```

**文件位置**: `packages/core/src/agents/supervisorAgent.ts`

---

### 2.2 Conflict Resolution Agent（冲突解决者）

**职责**: 检测并解决 Extraction 与 Visual Review 之间的字段冲突。

**核心能力**:
- 智能判断两个值是否实质性冲突（忽略大小写、空格差异）
- 计算冲突严重程度：`low` / `medium` / `high`
- 支持 4 种解决策略：
  - `use_extraction` - 使用抽取结果
  - `use_visual` - 使用视觉结果
  - `use_higher_confidence` - 使用置信度更高的
  - `needs_human_review` - 需要人工复核

**冲突解决示例**:
```typescript
// 场景：Extraction 识别为"男"(0.7)，Visual 识别为"女"(0.8)
// 结果：使用 Visual 结果"女"，因为置信度更高

// 场景：关键字段冲突且置信度接近
// 结果：标记为 needs_human_review，降低置信度并触发重新抽取
```

**文件位置**: `packages/core/src/agents/conflictResolutionAgent.ts`

---

## 三、架构改进对比

### 3.1 旧架构（V1）

```
START → preprocess → ocr → rag(空操作) → extraction(内含RAG+多轮)
  → visualReview(直接修改extraction) → validation → autoDecision
  → writeback → evaluation → END
```

**问题**:
- RAG 隐藏在 Extraction Agent 内部，无法在 Workflow 层观测
- Visual Review 直接覆盖 extraction 结果，丢失原始数据
- 多轮抽取在 Agent 内部循环，破坏可观测性
- 没有条件边，无法实现智能重试

---

### 3.2 新架构（V2）

```
START
  → supervisorNode (决策执行策略)
  → ocrNode
  → ragNode (独立的知识检索)
  → extractionNode (纯粹的字段抽取)
  → visualReviewNode (视觉评审)
  → conflictResolutionNode (冲突检测与解决)
      ↓
  → validationNode
      ├─ (缺失必填字段) → 回到 extractionNode (反馈循环)
      └─ (验证通过)
  → autoDecisionNode
  → writebackNode
  → evaluationNode (异步旁路)
  → END
```

**改进**:
- ✅ **RAG 独立化** - Workflow 层可观测检索质量
- ✅ **状态分离** - `extraction` / `visualReview` / `mergedCandidates` 独立存储
- ✅ **动态路径** - Supervisor 根据文档特征选择最优路径
- ✅ **反馈循环** - Validation 可触发 Extraction 重新执行
- ✅ **冲突解决** - 智能合并 Visual 与 Extraction 结果

---

## 四、关键技术实现

### 4.1 RAG 节点独立化

**Before**:
```typescript
// extractionAgent.ts (旧版)
const retrieval = await config.retriever.retrieve(retrieveRequest);
const extraction = await extractStructuredFields({
  ragContext: retrieval.context  // RAG 耦合在 Agent 内部
});
```

**After**:
```typescript
// langgraphRecognitionWorkflowV2.ts
const ragNode = async (state) => {
  const retrieval = await config.knowledgeRetriever.retrieve({
    query: `OCR文本：${state.ocrText.slice(0, 500)}`,
    fieldKeys: config.schema.fields.map(f => f.key)
  });
  return { ragResult: retrieval };  // 存入 state，供后续节点使用
};

const extractionNode = async (state) => {
  const ragContext = state.ragResult?.context ?? [];
  const extraction = await extractionAgent.run({
    schema: config.schema,
    ocrText: state.ocrText,
    ragContext  // 从 state 获取 RAG 上下文
  });
};
```

---

### 4.2 冲突解决与状态分离

**Before**:
```typescript
// visualReviewNode (旧版)
const enhancedExtraction = {
  ...state.extraction,
  candidates: mergedCandidates  // 直接修改 extraction
};
return { extraction: enhancedExtraction };  // 丢失原始数据
```

**After**:
```typescript
// conflictResolutionNode (新版)
const resolution = conflictResolutionAgent.run({
  schema: config.schema,
  extractionCandidates: state.extraction.candidates,  // 原始抽取
  visualCandidates: visualCandidates                  // 视觉结果
});

return {
  conflictResolution: resolution,
  mergedCandidates: resolution.mergedCandidates  // 单独存储合并结果
};
```

**State 结构**:
```typescript
state: {
  extraction: ExtractionAgentResult,      // 原始抽取结果（不可变）
  visualReview: VisualReviewAgentResult,  // 视觉评审结果（不可变）
  conflictResolution: ConflictResolutionResult,  // 冲突解决过程
  mergedCandidates: ModelFieldCandidate[]  // 最终合并结果
}
```

---

### 4.3 反馈循环与条件边

**实现**:
```typescript
function shouldRetryExtraction(state: LangGraphRecognitionState): string {
  const retryCount = state.retryCount ?? 0;
  const maxRetries = state.supervisorDecision?.maxRetryRounds ?? 2;

  // 场景 1：冲突解决后需要重新抽取
  if (state.conflictResolution?.needsReextraction && retryCount < maxRetries) {
    return "extractionNode";
  }

  // 场景 2：缺失必填字段需要重新抽取
  if (state.validation?.missingRequiredFieldKeys.length && retryCount < maxRetries) {
    return "extractionNode";
  }

  return "autoDecisionNode";  // 继续正常流程
}

// 在 Graph 中使用条件边
graph.addConditionalEdges("validationNode", shouldRetryExtraction);
```

**效果**:
- 自动重试缺失的必填字段
- 支持最多 N 轮重试（Supervisor 决定）
- 避免无限循环

---

## 五、向后兼容性

为保证平滑过渡，采用以下策略：

### 5.1 双版本并存

- **旧版 Workflow**: `langgraphRecognitionWorkflow.ts` (保留)
- **新版 Workflow**: `langgraphRecognitionWorkflowV2.ts` (推荐)

### 5.2 默认使用新版

```typescript
// jobOrchestrator.ts
export function createJobOrchestrator(config: JobOrchestratorConfig): JobOrchestrator {
  const { createLangGraphRecognitionWorkflowV2 } = require("./langgraphRecognitionWorkflowV2");
  const workflow = createLangGraphRecognitionWorkflowV2(config);  // 默认 V2
  // ...
}
```

### 5.3 旧版兼容性修复

- `ExtractionAgent` 支持 `ragContext` 参数传入（向后兼容）
- 旧版 Workflow 在 `extractionNode` 中内联执行 RAG（保持原有行为）

---

## 六、性能与可观测性提升

### 6.1 性能优化潜力

| 优化项 | 原理 | 预期收益 |
|--------|------|---------|
| **并行执行潜力** | Extraction 与 Visual Review 理论可并行 | ~30% 时间节省 |
| **提前终止** | Supervisor 可根据 OCR 质量跳过不必要节点 | ~20% 时间节省（低优先级任务） |
| **智能重试** | 只重新抽取缺失字段，而非全量 | ~50% 重试成本降低 |

**注**: 当前实现为顺序执行，并行优化已预留接口。

---

### 6.2 可观测性增强

#### Before (V1)
```typescript
trace: [
  { node: "extraction", status: "completed", message: "字段抽取已完成" }
]
// 无法知道 RAG 是否成功、检索了多少知识
```

#### After (V2)
```typescript
trace: [
  { node: "preprocess", status: "completed", message: "策略: full, ..." },
  { node: "rag", status: "completed", message: "检索到 5 条知识" },
  { node: "extraction", status: "completed", message: "字段抽取已完成" },
  { node: "visualReview", status: "completed", message: "视觉评审已完成(1200ms), 质量: high" },
  { node: "autoDecision", status: "completed", message: "检测到 3 个冲突并已解决" }
]

state: {
  supervisorDecision: { strategy: "full", reasons: [...] },
  ragResult: { entries: [...], context: [...] },
  conflictResolution: { hasConflicts: true, conflicts: [...] }
}
```

**收益**:
- 每个节点的执行状态、耗时、结果都可追溯
- Supervisor 的决策理由可审计
- 冲突解决的详细过程可回溯

---

## 七、使用指南

### 7.1 切换到新架构

无需修改业务代码，`createJobOrchestrator` 已默认使用 V2：

```typescript
import { createJobOrchestrator, createInMemoryJobRepository } from "@medical-record-agent/core";

const orchestrator = createJobOrchestrator({
  repository: createInMemoryJobRepository(),
  schema: mySchema,
  ocrProvider: myOcrProvider,
  modelProvider: myModelProvider,
  knowledgeRetriever: myRetriever,
  permissions: ["writeback:execute"],
  autoWritebackEnabled: true
});

// 使用方式不变
const result = await orchestrator.start({
  jobId: "job-001",
  document: { documentId: "doc-001", content: imageBuffer }
});
```

### 7.2 自定义 Supervisor 策略

```typescript
// 扩展 Supervisor Agent
import { createSupervisorAgent } from "@medical-record-agent/core";

const customSupervisor = createSupervisorAgent();
const decision = customSupervisor.decide({
  schema: mySchema,
  documentType: "table",
  hasImage: true,
  jobPriority: "high",  // 高优先级
  ocrResult: { /* OCR 结果 */ }
});

console.log(decision);
// {
//   strategy: "visual-priority",
//   enableVisualReview: true,
//   enableRAG: true,
//   maxRetryRounds: 3,
//   confidenceThreshold: 0.2,
//   reasons: ["高优先级任务，降低阈值并增加重试", "表格类文档，视觉识别优先"]
// }
```

### 7.3 查看冲突解决详情

```typescript
const result = await orchestrator.start(input);

if (result.conflictResolution?.hasConflicts) {
  console.log("检测到字段冲突:", result.conflictResolution.conflicts);
  // [
  //   {
  //     fieldKey: "patientGender",
  //     extractionValue: "男",
  //     extractionConfidence: 0.7,
  //     visualValue: "女",
  //     visualConfidence: 0.85,
  //     conflictSeverity: "high",
  //     resolution: "use_higher_confidence",
  //     reason: "视觉置信度 0.85 > 抽取置信度 0.70"
  //   }
  // ]
}
```

---

## 八、下一步优化建议

### 8.1 短期（1-2 周）

- [ ] **实现真正的并行执行**
  使用 LangGraph 的 `Channel` 机制，让 `extractionNode` 和 `visualReviewNode` 并行执行

- [ ] **Evaluation 异步化**
  将 `evaluationNode` 移到主流程之外，避免阻塞 Writeback

- [ ] **增强冲突解决策略**
  支持"加权平均"、"多数投票"等更复杂的合并策略

### 8.2 中期（1-2 月）

- [ ] **Agent 间消息协议**
  设计 `AgentMessage` 协议，支持 Agent 之间的请求-响应通信

- [ ] **动态 Schema 路由**
  根据文档内容自动选择最匹配的 Schema（多 Schema 场景）

- [ ] **可视化工作流编辑器**
  基于 LangGraph Studio 实现拖拽式工作流配置

### 8.3 长期（3-6 月）

- [ ] **自适应学习**
  Supervisor 根据历史执行数据，自动优化决策规则

- [ ] **分布式执行**
  支持跨机器的 Agent 执行（基于消息队列）

- [ ] **A/B 测试框架**
  同时运行 V1 和 V2 Workflow，对比识别准确率

---

## 九、迁移检查清单

在生产环境部署前，请确认：

- [ ] TypeScript 类型检查通过 (`pnpm typecheck`)
- [ ] 所有单元测试通过 (`pnpm test`)
- [ ] 在测试数据集上验证 V2 准确率 >= V1
- [ ] 监控系统已配置新增 Trace 节点的指标
- [ ] 文档已更新（README、API 文档、部署指南）
- [ ] 团队已完成新架构培训

---

## 十、附录

### A. 文件清单

| 文件路径 | 说明 |
|---------|------|
| `packages/core/src/agents/supervisorAgent.ts` | 新增：Supervisor Agent |
| `packages/core/src/agents/conflictResolutionAgent.ts` | 新增：冲突解决 Agent |
| `packages/core/src/agents/extractionAgent.ts` | 重构：移除 RAG 和多轮逻辑 |
| `packages/core/src/engine/langgraphRecognitionWorkflowV2.ts` | 新增：V2 Workflow |
| `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | 保留：V1 Workflow（向后兼容） |
| `packages/core/src/engine/jobOrchestrator.ts` | 更新：默认使用 V2 |
| `packages/core/src/index.ts` | 更新：导出新组件 |

### B. 性能基准测试（建议）

```bash
# 在真实数据集上对比 V1 vs V2
pnpm run benchmark:workflow-v1  # 运行 100 个样本
pnpm run benchmark:workflow-v2  # 运行 100 个样本

# 预期结果
# - 准确率: V2 >= V1 (目标: +2-5%)
# - 平均耗时: V2 约等于 V1 (±10%)
# - 冲突自动解决率: V2 独有指标 (目标: >80%)
```

### C. 贡献者

- **架构设计与实现**: Claude Sonnet 4.6
- **需求分析**: 基于 HANDOVER.md 和代码审查
- **优化日期**: 2026-06-17

---

**版本历史**:
- `v2.0.0` - 2026-06-17 - 初始版本，完成核心架构优化
