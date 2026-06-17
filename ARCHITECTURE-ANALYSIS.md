# Medical-Record-Agent 架构分析报告

> 生成时间：2026-06-16
> 分析范围：packages/core (engine/agents/providers/rag) + apps/api/bootstrap

---

## 1. 当前数据流图

```
上传文件 (OcrDocumentInput)
    │
    ▼
┌──────────────┐
│  preprocess  │  ← 空节点，仅打 trace 标记
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌─────────────────────┐
│     OCR      │────▶│ documentPipeline.ts  │ → 调用 OcrProvider.recognize()
└──────┬───────┘     │ (单文档/多文档合并)   │   输出: OcrResult + ocrText
       │             └─────────────────────┘
       ▼
┌──────────────┐
│    RAG       │  ← 轻量节点，实际检索延迟到 Extraction Agent 内部
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────────────────────┐
│  Extraction  │────▶│ extractionAgent.ts            │
│              │     │  1. inMemoryKnowledgeRetriever │ → 关键词匹配检索 RAG 上下文
│              │     │  2. extractionEngine.ts        │ → 构建 prompt + 调用 LLM
│              │     │  3. parseModelExtractionOutput │ → 解析 JSON → ModelFieldCandidate[]
└──────┬───────┘     └──────────────────────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────────────────────┐
│  Validation  │────▶│ validationEngine.ts           │
│              │     │  1. normalizeEnumCandidate    │ → 枚举值归一化
│              │     │  2. validationAgent.run()     │ → 类型/枚举/置信度/证据检查
│              │     │  3. appendConflictWarnings    │ → 冲突候选检测
│              │     │  4. missingRequiredFieldKeys  │ → 必填字段缺失检测
└──────┬───────┘     └──────────────────────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────────────────────┐
│ AutoDecision │────▶│ autoDecisionPolicy.ts         │
│              │     │  输入: validation + writeback  │
│              │     │  输出: green/yellow/red        │
│              │     │  + shouldWriteback             │
│              │     │                                │
│              │     │ writebackAgent.run()           │
│              │     │  → 检查就绪状态 + readyFields  │
└──────┬───────┘     └──────────────────────────────┘
       │
       ▼
┌──────────────┐
│  Writeback   │  ← 若 shouldWriteback && ready → 调用 writebackExecutor
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────────────────────┐
│  Evaluation  │────▶│ evaluationAgent.ts            │
│              │     │  → 生成评测样本候选 (accepted  │
│              │     │    fields → groundTruth)       │
└──────┬───────┘     └──────────────────────────────┘
       │
       ▼
┌──────────────┐
│  Finalize    │  ← 计算最终 status
└──────────────┘
```

**关键数据流说明：**
- 线性顺序执行，无条件分支/循环（纯 DAG，非条件图）
- 错误传播：任何节点失败后，后续节点全部 skip
- 状态通过 LangGraph Annotation reducer 合并（trace 用 concat）

---

## 2. 各模块职责和接口

### 2.1 Engine 层

| 模块 | 职责 | 核心输入 | 核心输出 |
|------|------|---------|---------|
| **langgraphRecognitionWorkflow.ts** | 定义 9 节点 LangGraph 状态图 | `JobOrchestratorInput` | `JobOrchestratorResult` |
| **jobOrchestrator.ts** | 任务编排器，封装状态转换记录 | `JobOrchestratorInput` | `JobOrchestratorResult` + 状态转换 |
| **extractionEngine.ts** | 构建 LLM prompt + 解析结构化输出 | schema + ocrText + RAG上下文 | `ModelFieldCandidate[]` |
| **validationEngine.ts** | 字段级验证 + 归一化 + 冲突检测 | schema + candidates | `ValidationEngineResult` |
| **autoDecisionPolicy.ts** | 绿/黄/红三色决策 + 写回判断 | validation + writeback + 配置 | `AutoDecisionPolicyResult` |
| **documentPipeline.ts** | OCR 调用 + 多文档合并 | OcrProvider + document(s) | `DocumentPipelineResult` |

### 2.2 Agent 层

| 模块 | 职责 | allowedTools（类型约束） | 同步/异步 |
|------|------|------------------------|----------|
| **extractionAgent.ts** | RAG 检索 + LLM 抽取 | `knowledge.retrieve`, `model.extractFields` | async |
| **validationAgent.ts** | 字段类型/枚举/置信度验证 | `schema.validateCandidates` | sync |
| **writebackAgent.ts** | 写回就绪检查 | `writeback.checkReadiness` | sync |
| **evaluationAgent.ts** | 生成评测样本候选 | `evaluation.createSampleCandidate` | sync |

> **注意**：Agent 是纯函数管道步骤，不是 LLM Agent。`allowedTools` 是类型约束而非运行时能力。

### 2.3 Provider 层

| 接口 | 方法 | 关键字段 |
|------|------|---------|
| `OcrProvider` | `recognize(input: OcrDocumentInput): Promise<OcrResult>` | pages, blocks, qualityWarnings |
| `ModelProvider` | `extractFields(request: ModelExtractionRequest): Promise<ModelExtractionResult>` | candidates: ModelFieldCandidate[] |
| `KnowledgeRetriever` | `retrieve(request: KnowledgeRetrieveRequest): Promise<KnowledgeRetrieveResult>` | entries, context: string[] |

**实现：**
- `httpLlmProvider.ts` → OpenAI 兼容 HTTP API（支持 vision/base64 图片）
- `httpOcrProvider.ts` → PaddleOCR HTTP（支持分页 + 扁平两种响应格式）
- `inMemoryKnowledgeRetriever.ts` → 关键词匹配 + fieldKey 重叠打分

### 2.4 核心类型

```typescript
// 字段候选（贯穿全流程的核心数据结构）
interface ModelFieldCandidate {
  fieldKey: string;
  value: string | number | boolean | string[] | null;
  rawValue: string;
  confidence: number;  // 0-1
  evidence: ModelEvidence[];  // snippet + startOffset + endOffset + pageNumber + blockId
}

// 工作流状态机
type RecognitionRuntimeStatus =
  | "queued" | "running" | "completed" | "partial_completed"
  | "needs_review" | "writeback_pending" | "writeback_completed"
  | "writeback_failed" | "failed";

// 自动决策三色灯
type AutoDecision = "green" | "yellow" | "red";
```

---

## 3. 模块间依赖关系

```
langgraphRecognitionWorkflow.ts
  ├── agents/extractionAgent.ts
  │     ├── engine/extractionEngine.ts
  │     │     └── providers/providerTypes.ts (ModelProvider)
  │     └── rag/inMemoryKnowledgeRetriever.ts
  │           └── rag/knowledgeBase.ts
  ├── agents/writebackAgent.ts
  ├── agents/evaluationAgent.ts
  ├── engine/documentPipeline.ts
  │     └── providers/providerTypes.ts (OcrProvider)
  ├── engine/validationEngine.ts
  │     └── agents/validationAgent.ts
  ├── engine/autoDecisionPolicy.ts
  │     └── agents/writebackAgent.ts (类型)
  └── engine/jobOrchestrator.ts (类型)

providers/httpLlmProvider.ts
  └── engine/extractionEngine.ts (parseModelExtractionOutput)

providers/httpOcrProvider.ts
  └── providers/providerTypes.ts

apps/api/bootstrap/production-services.ts
  ├── @medical-record-agent/core (所有导出)
  ├── PrismaClient
  ├── repositories/* (jobs, results, files, users, providers, schemas, ...)
  ├── services/* (api-services, jobQueue, schema, stats)
  ├── auth/* (JWT, 权限, 会话)
  ├── storage/* (local, S3)
  └── infrastructure/* (OpenAI LangChain, OpenAI Responses)
```

**依赖方向：**
- `engine` → `agents` → `providers` + `rag`（单向依赖）
- `apps/api` → `core` + 基础设施（Prisma/Redis/S3）
- `core` 不依赖任何基础设施（纯函数层）

---

## 4. 当前架构的限制

### 4.1 工作流层面

| 限制 | 详情 |
|------|------|
| **纯线性执行，无条件分支** | 9 个节点全部用 `addEdge` 串行连接，无条件路由。即使 OCR 失败也需要遍历后续 7 个 skip 节点 |
| **无重试/回退策略** | 工作流层面没有节点级重试机制，Provider 的重试在 Provider 层内部完成 |
| **无并行执行** | validation 和 writebackAgent 可以并行（无数据依赖），但当前串行执行 |
| **状态全量传递** | 每个节点返回部分状态合并到全量 state，随着节点增多 state 会膨胀 |
| **ragNode 是空操作** | RAG 检索实际发生在 extractionAgent 内部，ragNode 只打 trace，增加了无意义的节点 |

### 4.2 抽取引擎层面

| 限制 | 详情 |
|------|------|
| **单次 LLM 调用** | 所有字段在一次 prompt 中抽取，字段多时 prompt 很长，单字段错误无法局部重试 |
| **输出解析脆弱** | `parseModelExtractionOutput` 依赖 LLM 输出严格 JSON，解析失败返回 null 无降级 |
| **视觉增强有限** | 图片通过 base64 内嵌 prompt，大图可能超 token 限制；多文档模式不传图片 |
| **无流式输出** | LLM 调用等待完整响应，无法渐进式返回结果 |

### 4.3 RAG 层面

| 限制 | 详情 |
|------|------|
| **纯关键词匹配** | `inMemoryKnowledgeRetriever` 使用简单的关键词包含检测，无语义理解 |
| **全量扫描** | 每次检索遍历所有 entries，无索引优化 |
| **知识库内存加载** | `KnowledgeBase` 全量驻留内存，知识库增大后内存压力大 |

### 4.4 Provider 层面

| 限制 | 详情 |
|------|------|
| **OCR 串行调用** | 多文档 OCR 用 `for` 循环逐个调用，无并发 |
| **LLM 超时固定** | Vision 请求硬编码 300s，普通请求默认 120s，无法按请求复杂度动态调整 |
| **OCR 响应映射复杂** | `OcrResponseMapping` 支持了过多路径别名，增加维护成本 |

### 4.5 服务组装层面

| 限制 | 详情 |
|------|------|
| **单文件 2875 行** | `production-services.ts` 承担了所有依赖组装，过于庞大 |
| **Provider 配置分散** | 同时支持 env 变量 + 数据库 ProviderConfig，配置来源不统一 |

---

## 5. 可扩展性分析

### 5.1 ✅ 良好的可扩展性

| 方面 | 说明 |
|------|------|
| **Provider 抽象** | OcrProvider / ModelProvider 接口清晰，切换实现零代码改动 |
| **Schema 驱动** | 字段定义通过 CoreSchemaDraft 配置化，新增字段只需改 schema |
| **纯函数核心** | packages/core 不依赖基础设施，易于单元测试和独立验证 |
| **错误脱敏** | ProviderError 统一错误边界，不泄露病历原文 |
| **证据追溯** | 每个字段值必须附带 evidence（snippet + offset + blockId），可审计 |

### 5.2 ⚠️ 需要改进的扩展性

| 方面 | 现状 | 建议 |
|------|------|------|
| **新增工作流节点** | 需要修改 langgraphRecognitionWorkflow.ts 的图定义 + 状态类型 | 考虑插件化节点注册 |
| **并发 OCR** | 多文档串行 | 改用 `Promise.all` 并发 |
| **RAG 升级** | 关键词匹配 | 可替换为向量检索（接口已抽象） |
| **多模型路由** | 单 ModelProvider | 可通过 ProviderRegistry 按字段类型路由不同模型 |
| **工作流条件分支** | 纯线性 | LangGraph 支持条件边，可按 OCR 质量/文档类型路由不同路径 |
| **生产服务拆分** | 单文件 2875 行 | 按领域拆分为多个 service factory |

### 5.3 扩展路径建议

1. **短期（低成本）**：并发 OCR、ragNode 移入 extractionNode（消除空节点）
2. **中期**：工作流加条件分支（OCR 质量 → 是否需要 Vision 增强）、字段级重试
3. **长期**：向量 RAG、多模型路由、服务组装模块化

---

## 附录：关键文件清单

| 文件 | 行数 | 核心导出 |
|------|------|---------|
| langgraphRecognitionWorkflow.ts | 421 | `createLangGraphRecognitionWorkflow` |
| extractionEngine.ts | 364 | `buildExtractionPrompt`, `extractStructuredFields`, `parseModelExtractionOutput` |
| validationEngine.ts | 137 | `runValidationEngine`, `getRequiredFieldKeys` |
| autoDecisionPolicy.ts | 113 | `evaluateAutoDecision` |
| documentPipeline.ts | 129 | `runDocumentPipeline`, `runMultiDocumentPipeline` |
| jobOrchestrator.ts | 163 | `createJobOrchestrator`, `createInMemoryJobRepository` |
| extractionAgent.ts | 75 | `createExtractionAgent` |
| validationAgent.ts | 155 | `createValidationAgent` |
| writebackAgent.ts | 129 | `createWritebackAgent` |
| evaluationAgent.ts | 65 | `createEvaluationAgent` |
| providerTypes.ts | 239 | `OcrProvider`, `ModelProvider`, `ProviderError`, 各种 Config 类型 |
| httpLlmProvider.ts | 178 | `createHttpLlmProvider` |
| httpOcrProvider.ts | 396 | `createHttpOcrProvider` |
| inMemoryKnowledgeRetriever.ts | 62 | `createInMemoryKnowledgeRetriever`, `KnowledgeRetriever` |
| production-services.ts | 2875 | 生产环境依赖注入组装 |
