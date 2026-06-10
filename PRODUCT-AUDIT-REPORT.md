# 1. 产品概述（定位、目标用户、核心价值）

审计基准：`/tmp/Medical-Record-Agent` 当前工作区代码，审计时间 2026-06-08。工作区存在未提交变更，本报告按当前文件状态审计。

产品定位：Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗文档结构化识别工作台。系统目标是围绕 Schema、OCR/LLM Provider、LangGraph Agent 工作流、字段证据、人工复核、评估和 LIMS 写回治理，形成可配置、可审计的医疗数据处理链路。

目标用户：

- 临床数据录入与复核人员：上传病历、查看识别字段、证据和置信度，提交修正反馈。
- 医疗检验 / LIMS 运维人员：维护 Provider、Schema、写回策略和审计日志。
- 数据科学与评测人员：导入脱敏评估集、运行字段级评估、比较模型或 Schema 版本。
- 系统管理员 / 安全负责人：管理权限、审计高风险操作、控制真实 OCR/LLM/LIMS 集成。

核心价值：

- 将非结构化病历转为可写回的结构化字段候选，保留证据链和置信度。
- 用 Schema 版本化管理字段定义和写回映射，降低临床字段变更风险。
- 用评估数据集和 metrics 验证模型、Schema、Provider 变更效果。
- 用权限、审计、幂等和人工确认约束 LIMS 写回等高风险动作。

# 2. 功能完整性（页面清单、功能清单、实现状态）

## 页面清单

| 页面 | 路由 | 主要代码 | 实现状态 |
| --- | --- | --- | --- |
| 登录页 | `/login` | `apps/demo-web/src/pages/auth/LoginPage.tsx` | 已实现登录表单、开发/demo 凭据预填控制、错误提示；生产构建不预填 demo 凭据。 |
| 识别看板 | `/` | `apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx` | 已有看板入口和操作导航；从代码结构判断仍偏演示态，缺少完整后端任务列表 API 闭环。 |
| 新建识别 | `/recognition/new` | `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx` | 已实现文件选择、前端文件校验、SHA-256、base64 上传、Schema/Provider 选项加载、创建任务。 |
| 任务详情 | `/recognition/jobs/:jobId` | `apps/demo-web/src/pages/recognition/JobDetailPage.tsx` | 可读取 `/jobs/:id` 与 `/results/:jobId`，展示字段、证据、trace、payload、反馈；但失败或缺失字段时继续用静态 demo 数据兜底。 |
| Schema Studio | `/schema` | `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx` | 已覆盖草稿、校验、发布、停用、回滚、版本对比的页面能力。 |
| 评测中心 | `/evaluation` | `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx` | 已覆盖数据集、样本导入、run 创建、metrics 展示、版本比较。 |
| 反馈样本 | `/feedback` | `apps/demo-web/src/pages/operations/FeedbackSamplesPage.tsx` | 已实现反馈样本运营页，具体后端流程依赖 `/feedback`。 |
| Provider 设置 | `/providers` | `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx` | 已实现 Provider 列表、保存、设默认、健康检查。 |
| 写回控制 | `/writeback` | `apps/demo-web/src/pages/operations/WritebackPage.tsx` | 已实现 eligible 列表、按 jobId 加载、二次确认、调用写回；但保留静态 demo 列表兜底。 |
| Agent Trace | `/trace` | `apps/demo-web/src/pages/operations/AgentTracePage.tsx` | 已有 trace 页面；代码中包含合成样本静态 trace。 |
| 审计日志 | `/audit` | `apps/demo-web/src/pages/operations/AuditLogPage.tsx` | 已接 `/audit` 列表。 |
| 数据集规范 | `/docs` | `apps/demo-web/src/pages/misc/DatasetSpecPage.tsx` | 已实现静态规范页。 |

## API 功能清单

| 功能域 | 路由 | 主要代码 | 实现状态 |
| --- | --- | --- | --- |
| 健康检查 | `GET /health`, `GET /status` | `apps/api/src/server.ts` | 已实现，`/status` 返回服务模式与 provider runtime。 |
| 登录鉴权 | `POST /auth/login` | `apps/api/src/routes/auth.routes.ts`, `apps/api/src/auth/auth.service.ts` | 已实现 bcrypt、JWT、API token、权限展开。 |
| 文件上传/下载 | `POST /files`, `GET /files/:id/content` | `apps/api/src/routes/files.routes.ts`, `apps/api/src/services/api-services.ts` | 生产服务支持 base64 内容校验、SHA-256、受控存储；demo 服务返回固定文件。 |
| 识别任务 | `POST /jobs`, `GET /jobs/:id` | `apps/api/src/routes/jobs.routes.ts`, `apps/api/src/services/api-services.ts` | 生产服务同步调用核心编排并落库结果；demo 服务只创建 queued 内存任务。 |
| 识别结果 | `GET /results/:jobId` | `apps/api/src/routes/results.routes.ts` | 已实现按 jobId 读取。 |
| 反馈 | `POST /feedback` | `apps/api/src/routes/feedback.routes.ts` | 已实现创建入口；路由层契约较宽松。 |
| 写回 | `GET /writeback/eligible`, `POST /writeback` | `apps/api/src/routes/writeback.routes.ts` | 已有权限、二次确认、审计 hook、生产 LIMS adapter；服务端对请求 fields/payload 的可信边界不足。 |
| Provider | `GET /providers`, `PUT /providers/:key`, `POST /providers/:key/default`, `POST /providers/:key/health` | `apps/api/src/routes/providers.routes.ts` | 已实现保存、设默认、健康检查；生产模式支持 env provider 与数据库 provider 合并。 |
| Schema | `/schemas...` | `apps/api/src/routes/schemas.routes.ts`, `apps/api/src/services/schema.service.ts` | 已实现 active 列表、草稿、校验、发布、停用、回滚、对比。 |
| Evaluation | `/evaluations...` | `apps/api/src/routes/evaluation.routes.ts`, `apps/api/src/services/api-services.ts` | 已实现数据集、样本导入、run、metrics；生产 runner 当前固定 LIMS schema。 |
| Audit | `GET /audit` | `apps/api/src/routes/audit.routes.ts`, `apps/api/src/middleware/audit.middleware.ts` | 已实现近期审计日志和高风险路由记录。 |

## 核心包功能清单

| 模块 | 主要代码 | 实现状态 |
| --- | --- | --- |
| LangGraph 识别工作流 | `packages/core/src/engine/langgraphRecognitionWorkflow.ts` | 已串联 preprocess、OCR、RAG、extraction、validation、autoDecision、writeback、evaluation。 |
| 字段校验 | `packages/core/src/engine/validationEngine.ts` | 已做 enum 归一、关键字段缺失、冲突候选处理；关键字段规则仍硬编码 `clinicalDiagnosis`。 |
| 自动决策 | `packages/core/src/engine/autoDecisionPolicy.ts` | 已输出 green/yellow/red、写回开关、权限和 schema 状态原因。 |
| 写回准备 | `packages/core/src/agents/writebackAgent.ts` | 已要求 green、权限、非空值、目标路径和 auto writeback mode。 |
| LIMS adapter | `packages/core/src/adapters/limsWritebackAdapter.ts` | 已支持幂等 header、重试、响应映射。 |
| OCR/LLM Provider | `packages/core/src/providers/*` | 已支持 mock、HTTP OCR、HTTP/OpenAI-compatible、LangChain、OpenAI Responses。 |
| Evaluation | `packages/core/src/evaluation/*` | 已实现字段准确率、证据覆盖率等 metrics。 |

# 3. 业务流程完整性（核心业务流程是否闭环）

## 识别主流程

目标闭环：登录 -> 上传病历文件 -> 创建识别任务 -> OCR -> LLM 抽取 -> 字段校验 -> 自动决策 -> 结果查看 -> 人工反馈/写回。

代码验证：

- 前端 `NewRecognitionPage.tsx` 会构造文件上传入参，包含 `contentBase64`、`checksumSha256`、metadata，然后调用 `api.createFile` 和 `api.createRecognitionJob`。
- 生产服务 `apps/api/src/services/api-services.ts` 在创建文件时会校验 base64、SHA-256，并把文件写入 storage；创建任务时会读取受控存储文件、创建 RecognitionJob、调用 `recognitionOrchestrator.start`、保存 RecognitionResult。
- 核心编排 `packages/core/src/engine/langgraphRecognitionWorkflow.ts` 已串联 OCR、抽取、校验、自动决策、写回准备和评估样本候选。

审计结论：生产模式代码具备闭环骨架，但当前仓库前端构建失败，且默认 `pnpm dev:api` 的 demo 服务没有触发 OCR/LLM/validation 编排，只返回固定演示结果，不能作为产品级端到端验收闭环。

## 人工复核与反馈流程

目标闭环：详情页查看字段和证据 -> 选择字段 -> 提交反馈 -> 后端保存反馈 -> 后续规则/评估消费。

代码验证：

- `JobDetailPage.tsx` 已提供字段候选、证据面板、反馈表单和 `api.createFeedback` 调用。
- `feedback.routes.ts` 有创建入口，生产服务转交 `feedbackRepository.create`。

审计结论：流程入口存在，但前端当前因为 `evidenceId?: string` 被传成 `string | undefined` 导致 typecheck/build 失败；反馈数据后续如何驱动规则候选或 Schema 迭代未形成明确闭环。

## Schema 变更流程

目标闭环：创建草稿 -> 校验 -> 发布 -> 停用/回滚 -> 对比。

代码验证：

- API 路由覆盖 `/schemas/drafts`、`/validate`、`/publish`、`/deactivate`、`/rollback`、`/compare`。
- Prisma 模型有 `SchemaDraft`、`SchemaVersion`、唯一键 `schemaKey + version`。
- 生产识别会优先解析数据库 active schema，校验失败则显式失败。

审计结论：Schema 管理闭环较完整。

## Provider 配置流程

目标闭环：查看 provider -> 保存配置 -> 设置默认 -> 健康检查 -> 识别任务使用。

代码验证：

- `ProviderSettingsPage.tsx` 调用 list/save/default/health。
- 生产服务 `createProviderRegistry` 合并 env provider 与数据库 provider，并在识别编排前按 provider key 解析 OCR/LLM runtime。

审计结论：Provider 配置和识别使用已打通，但在线保存的 secretRefs 尚未解密注入真实 provider header，代码注释说明“后续接入生产密钥库”。

## Evaluation 流程

目标闭环：创建脱敏数据集 -> 导入样本 -> 创建评测 run -> 运行识别 -> 持久化 metrics -> 展示结果。

代码验证：

- `evaluation.routes.ts` 覆盖数据集、样本、runs、metrics。
- `api-services.ts` 对真实样本要求 deidentified 和脱敏证明。
- `createProductionEvaluationRunner` 会复用正式识别编排并保存 RecognitionResult 和 metrics。

审计结论：评估闭环存在，但生产 runner 当前硬编码 `limsClinicalInfoSchema`，未真正使用用户创建 run 时传入的 `schemaKey`。

## 写回流程

目标闭环：只列出 green 且未写回任务 -> 人工二次确认 -> 服务端复核任务状态和 readyFields -> LIMS adapter 幂等写回 -> 审计记录。

代码验证：

- `writeback.routes.ts` 要求 `writeback:execute` 权限、`confirmed=true`、任务状态 completed/confirmed，并记录 audit。
- `createProductionWritebackExecutor` 会记录 WritebackAttempt，调用 LIMS adapter，按结果 complete。
- `jobsRepository.listEligibleForWriteback` 会过滤 completed、非 reviewRequired、无 pending/running/succeeded writeback 的任务。

审计结论：写回基础能力存在，但服务端执行时信任请求体中的 `fields`/`payload`，没有重新从数据库 RecognitionResult 读取并比对 `payload.writeback.readyFields`，高风险流程未达到产品级安全闭环。

# 4. 用户体验（性能、交互、错误处理、移动端适配）

性能：

- 前端采用 Vite + React，页面层按路由拆分清晰，但未看到懒加载路由或大页面分包策略。
- API 生产识别创建任务时同步调用完整编排并等待结果落库，长 OCR/LLM 任务可能导致请求超时或用户等待时间不可控。当前任务状态模型有 queued/running/completed，但缺少异步任务队列或轮询 API 的完整产品体验。

交互：

- 新建识别页有拖拽/选择上传、类型和大小校验、取消、重跑、合成样本。
- 任务详情页有字段候选、证据、payload、trace、反馈和写回入口。
- 写回页有二次确认、取消、重跑、权限禁用态。
- Schema、Evaluation、Provider、Audit 页面覆盖运维操作面。

错误处理：

- API client 将部分文件错误码转换为中文提示。
- 多数页面在真实 API 失败时保留 demo 兜底数据，这对演示友好，但对生产用户会掩盖真实失败和数据缺失。例如 `JobDetailPage.tsx` 在 `/jobs` 或 `/results` 失败后仍展示静态 OCR/字段/证据；`WritebackPage.tsx` 在 eligible 失败后保留静态 demo 写回列表。
- 登录页仅显示错误码或“API 服务已启动”类提示，缺少账号停用、权限不足、服务不可用的细分反馈。

移动端适配：

- 已有 `ui-arco-style-guards.test.ts`，`pnpm --filter @medical-record-agent/demo-web test:mobile` 通过 1 项 mobile 断言。
- 页面表格使用横向滚动，AppShell 有移动抽屉导航。
- 审计未进行真实浏览器截图验证；当前只依据代码和样式测试判断。

# 5. 技术实现（代码质量、API 完整性、数据模型）

## 工程结构

项目为 pnpm monorepo：

- `apps/api`：Fastify API、鉴权、路由、Repository、Storage、生产服务装配。
- `apps/demo-web`：React/Vite 控制台。
- `packages/core`：Agent 编排、Provider、Schema、Adapter、Evaluation。
- `packages/shared`：共享类型与 fixtures。
- `prisma`：PostgreSQL 数据模型、迁移、seed。
- `scripts`：生产 smoke、evaluation manifest、evaluation runner smoke。

整体模块边界清晰，测试覆盖面较广。

## 数据模型

Prisma schema 覆盖以下核心实体：

- 用户与权限：`User`、`Role`、`ApiToken`。
- 审计：`AuditLog`。
- 文件：`StoredFile`。
- 识别：`RecognitionJob`、`RecognitionResult`。
- Schema：`SchemaDraft`、`SchemaVersion`。
- 反馈与规则候选：`FeedbackSubmission`、`RuleCandidate`。
- Provider：`ProviderConfig`。
- 写回：`WritebackAttempt`。
- 评估：`EvaluationDataset`、`EvaluationSample`、`EvaluationRun`、`EvaluationMetric`。

数据模型覆盖产品主域，但仍有不足：

- `RecognitionJob` 缺少面向前端的列表查询 API，导致看板/任务列表难以真实化。
- 写回执行没有服务端强制绑定 RecognitionResult.readyFields，写回 payload 可信边界不清。
- 评估 run 的 schemaVersionId 数据模型存在，但当前服务创建 run 只保存 JSON `schemaConfig`，生产 runner 未按 schemaKey/schemaVersion 动态解析。

## API 完整性

优点：

- 路由按业务域拆分，权限 preHandler 基本覆盖高风险入口。
- 生产服务依赖注入清晰，便于测试、demo、production 三种模式切换。
- 文件上传、评估样本导入、Provider health、LIMS 写回有安全注释和基本防护。

不足：

- 多个路由服务接口仍使用 `unknown`，例如 `FileRouteService.createUpload(input: unknown)`、`JobRouteService.create(input: unknown)`、`WritebackRouteService.execute(input: unknown)`，导致契约主要靠运行时和页面宽松解析维持。
- 前端 API 契约类型与页面调用仍不完全一致，当前导致 build/typecheck 失败。
- `POST /jobs` 同步执行 OCR/LLM 编排，不适合真实大文件/慢 provider 的生产任务队列模型。

## 验证命令结果

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 通过。56 个测试文件中 55 passed、1 skipped；260 个测试中 259 passed、1 skipped。运行中出现 Node `punycode` deprecation warning。 |
| `pnpm typecheck` | 失败。`apps/demo-web/src/pages/recognition/JobDetailPage.tsx:529` 调用 `createFeedback` 时传入 `evidenceId: string | undefined`，不满足 `CreateFeedbackInput.evidenceId?: string` 在 `exactOptionalPropertyTypes` 下的类型约束。 |
| `pnpm build` | 失败。`apps/demo-web/src/pages/operations/WritebackPage.tsx:484` 中 `confirmed` 被推断为 `boolean`，不满足 `ExecuteWritebackInput.confirmed: true`；`JobDetailPage.tsx:529` 同上反馈入参错误。 |
| `pnpm --filter @medical-record-agent/api build` | 通过。 |
| `pnpm --filter @medical-record-agent/core build` | 通过。 |
| `pnpm --filter @medical-record-agent/shared build` | 通过。 |
| `pnpm --filter @medical-record-agent/demo-web build` | 失败。与根级 build 中的 demo-web TypeScript 错误一致。 |
| `pnpm --filter @medical-record-agent/demo-web test:styles` | 通过。6 tests passed。 |
| `pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过。1 passed、5 skipped。 |
| `pnpm smoke:production` | 未能执行生产 smoke。失败原因：`PRODUCTION_SMOKE_BASE_URL 未配置，无法执行 production smoke。` |

# 6. 问题清单（按 P0/P1/P2 分级，必须具体到文件/功能/影响/修复建议）

## P0

### P0-1 前端 TypeScript 构建失败，项目无法交付生产前端产物

- 文件/功能：`apps/demo-web/src/pages/recognition/JobDetailPage.tsx:529`，反馈提交；`apps/demo-web/src/pages/operations/WritebackPage.tsx:484`，写回提交；`apps/demo-web/src/api/types.ts:374` 和 `apps/demo-web/src/api/types.ts:409`，前端 API 契约。
- 现象：`pnpm typecheck` 与 `pnpm build` 均失败。`createFeedback` 传入 `evidenceId/evidenceQuote: string | undefined`，在 `exactOptionalPropertyTypes` 下不能赋给可选 string；`createWritebackRequest` 返回的 `confirmed` 被推断为 `boolean`，不能赋给字面量类型 `true`。
- 影响：无法完成产品构建，CI/CD、部署和验收被阻断。
- 修复建议：构造反馈 payload 时只在值存在时添加 `evidenceId`、`evidenceQuote`；为 `createWritebackRequest` 添加显式返回类型或 `confirmed: true as const`；补充针对 `pnpm --filter @medical-record-agent/demo-web build` 的 CI 必跑检查。

## P1

### P1-1 写回执行信任客户端传入 fields/payload，服务端未绑定已验证 readyFields

- 文件/功能：`apps/api/src/routes/writeback.routes.ts:88`，`apps/api/src/bootstrap/production-services.ts:1480`，LIMS 写回。
- 现象：路由只校验 `confirmed=true` 和任务状态 completed/confirmed，然后将 request body 交给 `writebackService.execute`；生产 executor 从请求体读取 `fields`，若无 fields 则使用请求体 payload。
- 影响：拥有写回权限的调用方可构造与识别结果不一致的字段或 payload 写入 LIMS，绕过 core `WritebackAgent` 已验证的 `payload.writeback.readyFields`。
- 修复建议：`POST /writeback` 只接收 `jobId`、`confirmed`、可选幂等键；服务端必须重新读取 RecognitionJob/RecognitionResult，确认 `status=completed`、`reviewRequired=false`、无阻塞 writeback、存在 `payload.writeback.readyFields`，并只使用服务端 readyFields 生成 LIMS payload；客户端 payload 仅可作为展示数据，不可作为执行数据。

### P1-2 默认 demo API 创建识别任务不执行 OCR/LLM/校验，核心流程在默认运行方式下不闭环

- 文件/功能：`apps/api/src/index.ts` 默认 `API_SERVICE_MODE=demo`；`apps/api/src/demo-services.ts:446` 任务创建；`apps/api/src/demo-services.ts:472` 结果读取。
- 现象：`jobService.create` 仅创建 queued 内存任务；`resultService.getByJobId` 对任意 jobId 返回固定“演示诊断”。
- 影响：README 的 `pnpm dev:api` + `pnpm dev:web` 默认体验不能验证真实识别链路，新建识别成功后详情页看到的不是该文件的 OCR/LLM 结果。
- 修复建议：demo 模式也应使用 mock OCR + mock LLM + core orchestrator 完整跑一遍，并将结果与 jobId/sourceFileId 关联；如需静态演示，应单独标识为 Storybook/fixtures，不应冒充 API 结果。

### P1-3 详情页和写回页用静态 demo 数据兜底，掩盖真实 API 失败

- 文件/功能：`apps/demo-web/src/pages/recognition/JobDetailPage.tsx:471`，任务详情；`apps/demo-web/src/pages/operations/WritebackPage.tsx:638`，写回列表。
- 现象：真实 `/jobs` 或 `/results` 读取失败后，详情页继续展示静态 OCR、字段、证据、trace；eligible 写回加载失败后页面继续保留静态 demo 可写回列表。
- 影响：生产环境中用户可能误以为当前任务已有可用结果或可写回任务，增加误操作和错误判断风险。
- 修复建议：生产模式下禁用 demo fallback；API 失败时显示空态和重试按钮；仅在显式 `VITE_DEMO_MODE=true` 时展示静态样例，并在 UI 上永久标识为“演示数据，不可写回”。

### P1-4 Evaluation 创建 run 接受 schemaKey，但生产 runner 固定使用 LIMS 内置 schema

- 文件/功能：`apps/api/src/services/api-services.ts:783` 保存 `schemaConfig`；`apps/api/src/bootstrap/production-services.ts:1318` 和 `apps/api/src/bootstrap/production-services.ts:1326` 生产评估 runner。
- 现象：API 保存了用户输入的 `schemaKey`，但 `createProductionEvaluationRunner` 调用 `runEvaluation` 和创建识别任务时都固定使用 `limsClinicalInfoSchema`。
- 影响：评测中心无法可靠评估自定义 Schema 或指定版本，Schema Studio 的版本变更无法通过 Evaluation 闭环验证。
- 修复建议：评估 runner 应按 `runInput.schemaConfig.schemaKey/schemaVersionId` 解析 active schema，与生产识别 schema resolution 复用同一逻辑；metrics 中记录实际 schemaVersionId。

### P1-5 生产 smoke 未配置，外部集成未完成可执行验收

- 文件/功能：`scripts/production-smoke.ts`，生产 API smoke。
- 现象：`pnpm smoke:production` 因 `PRODUCTION_SMOKE_BASE_URL` 未配置直接失败。
- 影响：真实 API、登录、Provider health、可选识别/写回 smoke 未在本次审计环境验证；OCR/LLM/LIMS 外部集成只能基于代码判断，不能视为产品验收通过。
- 修复建议：提供受控测试环境 `.env` 或 CI secret，至少跑 `/status`、登录、Provider 列表和 health；在脱敏样本许可下启用 recognition smoke；写回 smoke 只对 LIMS sandbox 执行。

### P1-6 API 路由契约大量使用 unknown，前后端契约漂移风险已体现为构建失败

- 文件/功能：`apps/api/src/routes/*.ts` route service interface，`apps/demo-web/src/api/types.ts`，`apps/demo-web/src/api/client.ts`。
- 现象：多个 service 方法签名为 `unknown`，前端靠宽松解析和自定义类型维持；本次 build 失败即由前端 API 契约和页面调用不一致触发。
- 影响：接口字段调整难以及时暴露，页面容易进入“能跑测试但不能构建/不能真实对接”的状态。
- 修复建议：用 Zod schema 或共享 DTO 定义请求/响应；API route 层做 schema validation；前端 client 返回具体类型；在 CI 中同时执行 `pnpm test`、`pnpm typecheck`、`pnpm build`。

## P2

### P2-1 关键字段规则硬编码 clinicalDiagnosis，Schema 表达能力不足

- 文件/功能：`packages/core/src/engine/validationEngine.ts:21`，`packages/core/src/engine/autoDecisionPolicy.ts:35`。
- 现象：是否关键字段由 `fieldKey === "clinicalDiagnosis"` 决定。
- 影响：扩展到其他病历类型或非 LIMS 场景时，关键字段、必填字段、自动通过条件无法完全由 Schema 管理。
- 修复建议：在 `CoreFieldDefinition` 中增加 `required`、`critical`、`autoDecisionPolicy` 等配置，并由 Schema Studio 暴露编辑和校验。

### P2-2 任务创建同步执行完整编排，不适合真实慢 OCR/LLM 任务

- 文件/功能：`apps/api/src/services/api-services.ts:914`，`POST /jobs`。
- 现象：创建 job 后立即 `await recognitionOrchestrator.start` 并保存结果。
- 影响：真实 OCR/LLM/PDF 大文件可能导致 HTTP 请求超时；前端“队列/运行中”体验与实际同步执行不一致。
- 修复建议：引入异步任务队列或后台 worker；`POST /jobs` 仅创建任务并返回 jobId；前端轮询或订阅 `/jobs/:id` 状态；结果由 worker 写入。

### P2-3 访问令牌存储在 localStorage，医疗场景安全基线偏弱

- 文件/功能：`apps/demo-web/src/auth/AuthContext.tsx:20`。
- 现象：JWT 存储在 localStorage。
- 影响：一旦发生 XSS，token 易被读取；医疗数据系统通常需要更强的会话保护。
- 修复建议：生产环境使用 HttpOnly Secure SameSite Cookie 或短期 access token + refresh token 轮换；增加 CSP、登出失效和 token 过期处理。

### P2-4 Provider 保存的 secretRefs 尚未接入密钥库

- 文件/功能：`apps/api/src/bootstrap/production-services.ts:382`。
- 现象：在线保存的 HTTP/OpenAI-compatible provider 只读取 endpoint、model、headers，注释说明 secretRefs 后续接入密钥库。
- 影响：Provider Settings 页面虽然能保存配置，但真实密钥托管和注入链路未产品化。
- 修复建议：接入 KMS/Secret Manager/Vault；API 只保存 secret reference；运行时按权限解析并注入 provider headers；health check 不回显密钥。

### P2-5 缺少真实浏览器端到端验收

- 文件/功能：前端整体。
- 现象：已有 Vitest 和样式 guard，但未发现 Playwright/Cypress 级别的上传、详情、反馈、写回、移动端截图验收。
- 影响：布局、真实交互、文件上传、PDF 预览和权限导航问题可能无法在单测中暴露。
- 修复建议：增加 Playwright smoke：登录、创建合成识别、查看详情、提交反馈、进入写回、Provider health；移动端至少覆盖导航抽屉和表格横滚。

# 7. 验收结论（明确：通过 或 不通过，并给出改进建议）

结论：不通过。

判定依据：

- 存在 P0：`pnpm typecheck` 和 `pnpm build` 均失败，前端无法生成生产产物，阻断交付。
- 核心识别流程在生产代码中具备架构闭环，但默认 demo API 不执行真实 OCR/LLM/校验编排，页面又用静态数据兜底，当前产品体验不能证明端到端业务闭环。
- 写回流程属于医疗系统高风险动作，当前服务端仍信任客户端 fields/payload，未达到产品级安全闭环。
- 生产 smoke 未配置，真实 OCR/LLM/LIMS 外部集成未在本次环境完成验收。

优先改进建议：

1. 先修复 P0 构建问题，将 `pnpm typecheck`、`pnpm build` 纳入必过 CI。
2. 收紧写回服务端可信边界：执行数据只能来自服务端 RecognitionResult.readyFields，客户端只提交确认意图。
3. 让 demo 模式也跑完整 mock 编排，或在生产/验收模式彻底禁用静态 demo fallback。
4. 将 Evaluation runner 的 schema 解析与生产识别统一，支持指定 schemaKey/schemaVersion。
5. 配置并运行 production smoke，对真实 API、Provider health、脱敏识别样本和 LIMS sandbox 写回做可复现验收。
