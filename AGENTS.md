# Medical Record Agent — 项目导航

> 给 AI coding agent（Codex / Claude Code / Hermes）的项目指南。
> 阅读本文件后可以直接定位到需要修改的代码。

## 一句话

医疗 OCR 识别系统：上传病历图片 → OCR → LLM 结构化抽取 → 验证 → 回写 LIMS。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + Arco Design + Vite + TanStack Query |
| 后端 | Fastify 5 + TypeScript |
| 数据库 | PostgreSQL + Prisma ORM |
| 工作流 | LangGraph（@langchain/langgraph） |
| LLM | 火山引擎 doubao-seed-2.0-pro（OpenAI 兼容 HTTP） |
| OCR | PaddleOCR 3.x（HTTP） |
| 认证 | JWT + HttpOnly Cookie |

## 项目结构（只看这棵树就够了）

```
Medical-Record-Agent/
├── apps/api/                    # Fastify 后端（端口 3000）
│   ├── src/
│   │   ├── index.ts             # 入口：加载 env → 创建 server → listen
│   │   ├── server.ts            # Fastify 实例：注册路由 + 中间件
│   │   ├── config/env.ts        # Zod 环境变量校验
│   │   ├── bootstrap/
│   │   │   └── production-services.ts  # ★ 生产依赖注入（2900行，所有服务在这里组装）
│   │   ├── auth/                # JWT 签发、权限、会话管理
│   │   ├── middleware/          # 审计、认证、安全头中间件
│   │   ├── repositories/       # Prisma 数据库操作（jobs/results/files/users/...）
│   │   ├── routes/              # Fastify 路由（REST API）
│   │   ├── services/            # 业务服务层
│   │   └── storage/             # 文件存储（local / S3）
│   └── prisma/
│       └── schema.prisma        # 数据库 schema（所有 model 在这里）
│
├── medical-ui/                  # React 前端（端口 9911）
│   └── src/
│       ├── main.tsx             # 入口
│       ├── App.tsx              # 路由定义
│       ├── api/client.ts        # API 客户端（fetch wrapper）
│       ├── api/types.ts         # 前端类型定义
│       ├── components/          # 通用组件（FieldGroup, ImageViewer, CheckboxMatrix...）
│       ├── pages/               # 页面（Dashboard, JobList, JobDetail, NewRecognition...）
│       ├── hooks/               # React Query hooks
│       ├── layout/AppLayout.tsx # 布局（侧边栏 + 内容区）
│       └── theme/               # 主题配置（Arco Design 定制）
│
├── packages/core/               # ★ 核心业务逻辑（纯函数，无基础设施依赖）
│   └── src/
│       ├── index.ts             # 统一导出
│       ├── engine/              # 工作流引擎
│       │   ├── langgraphRecognitionWorkflow.ts  # ★ 9节点 LangGraph 状态图
│       │   ├── jobOrchestrator.ts               # 任务编排器接口
│       │   ├── extractionEngine.ts              # LLM 抽取（prompt 构建 + 输出解析）
│       │   ├── documentPipeline.ts              # OCR 管线
│       │   ├── validationEngine.ts              # 字段验证
│       │   └── autoDecisionPolicy.ts            # 自动决策（绿/黄/红）
│       ├── agents/              # 受控 Agent（纯函数，不是 LLM Agent）
│       │   ├── extractionAgent.ts    # 抽取：RAG检索 + LLM抽取
│       │   ├── validationAgent.ts    # 验证：类型/枚举/置信度检查
│       │   ├── writebackAgent.ts     # 回写：检查就绪状态
│       │   └── evaluationAgent.ts    # 评估：生成评测样本
│       ├── providers/           # Provider 抽象层
│       │   ├── providerTypes.ts          # ★ 所有接口定义（OcrProvider, ModelProvider...）
│       │   ├── providerFactory.ts        # 工厂：根据 config 创建 provider
│       │   ├── httpOcrProvider.ts        # HTTP OCR（PaddleOCR）
│       │   ├── httpLlmProvider.ts        # HTTP LLM（OpenAI 兼容）
│       │   ├── langchainModelProvider.ts # LangChain 适配
│       │   ├── openAiResponsesProvider.ts# OpenAI Responses API
│       │   ├── mockOcrProvider.ts        # Mock（测试用）
│       │   └── mockModelProvider.ts      # Mock（测试用）
│       ├── rag/                 # 轻量 RAG
│       │   ├── knowledgeBase.ts              # ★ 知识库定义（癌症别名、检测项目、LIMS字典）
│       │   └── inMemoryKnowledgeRetriever.ts # 关键词匹配检索器
│       ├── schemas/             # Schema 定义
│       │   ├── schemaValidator.ts        # Schema 校验器
│       │   ├── tumorGeneTestSchema.ts    # ★ 肿瘤基因检测申请单 schema（20+字段）
│       │   └── limsClinicalInfoSchema.ts # LIMS 临床信息 schema
│       ├── adapters/            # LIMS 适配器
│       │   ├── limsClinicalPayloadAdapter.ts
│       │   ├── limsWritebackAdapter.ts
│       │   └── genericJsonAdapter.ts
│       ├── normalizers/         # 字段归一化（性别、年龄等）
│       └── evaluation/          # 评测框架（指标计算、评测运行）
│
└── packages/shared/             # 跨包共享类型
    └── src/
        ├── types.ts             # ★ 全局类型契约（506行）
        └── fixtures.ts          # 测试 fixtures
```

## 数据流（9 节点 LangGraph）

```
上传文件 → preprocess → OCR → RAG检索 → LLM抽取 → 验证 → 自动决策 → 回写 → 评估 → 完成
```

每个节点的输入/输出在 `langgraphRecognitionWorkflow.ts` 的 `RecognitionWorkflowAnnotation` 中定义。

## 常见修改场景

### 加一个新字段到识别 schema
1. 编辑 `packages/core/src/schemas/tumorGeneTestSchema.ts`，在 `fields` 数组加一项
2. 字段需要 `key`, `label`, `type`, `comments`（给 LLM 的提示）
3. 如果是 enum 类型，加 `enumMap`
4. 如果要回写 LIMS，加 `adapterHints.limsTargetPath`

### 切换 LLM 模型
1. 环境变量：`LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`
2. 或在数据库 `ProviderConfig` 表中修改 `llm` 类型的 provider

### 切换 OCR 服务
1. 环境变量：`OCR_PROVIDER=http`, `OCR_ENDPOINT`
2. 或在数据库 `ProviderConfig` 表中修改 `ocr` 类型的 provider

### 修改 RAG 知识库
1. 知识库存储在数据库 `KnowledgeEntry` 表中
2. 通过 API `GET/POST/PUT/DELETE /api/v1/knowledge` 管理
3. 启动时自动 seed 默认条目（如果表为空）
4. 知识条目有 `kind`, `title`, `content`, `keywords`, `fieldKeys`

### 修改前端页面
1. 页面在 `medical-ui/src/pages/`
2. 组件在 `medical-ui/src/components/`
3. API 调用在 `medical-ui/src/api/client.ts`
4. 类型定义在 `medical-ui/src/api/types.ts`
5. 构建：`cd medical-ui && pnpm build`

### 修改后端 API
1. 路由在 `apps/api/src/routes/`
2. 数据库操作在 `apps/api/src/repositories/`
3. 业务逻辑在 `packages/core/`（不要在 apps/api 里写业务逻辑）
4. 依赖注入在 `apps/api/src/bootstrap/production-services.ts`

## 关键设计原则

1. **packages/core 是纯函数层**：不依赖 Fastify、Prisma、文件系统。所有外部依赖通过接口注入。
2. **Agent 不是 LLM Agent**：是确定性管道中的纯函数步骤，`allowedTools` 是类型约束不是运行时能力。
3. **Provider 工厂模式**：切换 OCR/LLM 只需改配置，零代码改动。
4. **错误脱敏**：ProviderError 的 message 不能包含病历原文。
5. **证据追溯**：每个字段值必须有 evidence（snippet + offset + blockId）。

## 环境变量（必需）

```env
DATABASE_URL=postgresql://...
JWT_SECRET=至少32字符
LIMS_BASE_URL=...
LIMS_CLINICAL_INFO_ENDPOINT=...
LIMS_API_TOKEN=...
```

## 常用命令

```bash
# 安装
corepack enable && pnpm install

# 开发
pnpm --filter @medical-record-agent/api dev      # 后端 :3000
pnpm --filter medical-ui dev                      # 前端 :5173

# 构建
pnpm --filter medical-ui build                    # 前端构建
pnpm --filter @medical-record-agent/api build     # 后端构建

# 数据库
pnpm prisma migrate dev                           # 运行迁移
pnpm prisma db push                               # 推送 schema
pnpm prisma studio                                # 数据库 GUI

# 测试
pnpm test                                         # 全量测试
pnpm typecheck                                    # 类型检查
```
