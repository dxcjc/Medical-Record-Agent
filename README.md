# Medical Record Agent

Medical Record Agent 是一个基于 TypeScript 的通用病历识别 Agent 项目。它面向病历图片、PDF、扫描件和已有 OCR 文本，输出结构化字段候选、字段证据、置信度、质量告警和可选业务系统 payload。

项目当前以 LIMS 临床信息字段作为第一套默认 preset，但架构目标不是只服务 LIMS。核心能力按 Schema、Provider、Agent 工作流、评估、反馈、权限审计和写回治理拆分，后续可以扩展到更多医疗文档结构化和业务系统集成场景。

## 核心能力

- 病历文件接收、预处理、OCR 文本块归并和质量告警。
- 基于字段 Schema 的结构化抽取、证据定位、置信度输出和字段归一。
- 基于 LangGraph.js 的 Agent 工作流编排，覆盖 OCR、RAG、抽取、校验、自动决策、写回和评估节点。
- 基于 LangChain.js、OpenAI-compatible Provider、OpenAI Responses Provider 和内部测试 Provider 的模型调用抽象。
- Schema Studio：字段配置、草稿校验、版本发布、停用、回滚和版本对比。
- Provider Settings：OCR、LLM、Storage 和 LIMS provider 配置与健康检查。
- Evaluation：合成样本和真实脱敏样本的字段级评估、证据覆盖率和版本回归。
- Writeback：LIMS payload 预览、自动决策解释、权限校验、幂等和审计。
- Auth/Audit：用户登录、角色权限、API token 和高风险操作审计。
- Demo/Admin 前端：用于测试、演示、配置、评估、运维和写回控制。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 工程组织 | TypeScript、pnpm workspace |
| API 服务 | Fastify、Zod、JWT、bcryptjs |
| 数据访问 | Prisma、PostgreSQL |
| 文件存储 | 本地文件存储、S3/MinIO compatible Storage |
| Agent 工作流 | LangGraph.js |
| LLM 编排 | LangChain.js、OpenAI SDK、OpenAI-compatible HTTP Provider |
| 前端 | React、Vite、React Router、TanStack Query、lucide-react、driver.js |
| 测试 | Vitest、pg-mem、内部测试 Provider |

选型原因详见 [系统架构文档](docs/system-architecture.md)。

## 目录结构

```text
.
├── apps
│   ├── api                 # Fastify API、鉴权、路由、Repository、Storage
│   └── demo-web            # React Demo/Admin 前端
├── packages
│   ├── core                # Agent 工作流、Provider、Schema、Adapter、Evaluation
│   └── shared              # 跨前端、API、Core 共享的类型和 fixtures
├── prisma                  # Prisma schema、迁移和种子数据
├── docs
│   ├── system-architecture.md
│   ├── evaluation-datasets.md
│   └── superpowers         # superpowers 规格和实施计划
├── package.json
├── pnpm-workspace.yaml
└── vitest.config.ts
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备环境变量

复制 `.env.example` 为本地 `.env`，并按本地环境修改数据库、JWT、存储、OCR、LLM 和 LIMS 配置。

```bash
cp .env.example .env
```

注意：`.env.example` 只包含占位值，不能用于生产环境。真实密钥必须通过安全配置平台、部署密钥或本机受控 `.env` 注入。

### 3. 初始化数据库

项目目标数据库是 PostgreSQL。准备好 `DATABASE_URL` 后执行：

```bash
pnpm db:migrate
pnpm db:seed
```

### 4. 启动服务

分别启动 API 和 Demo/Admin 前端：

```bash
pnpm dev:api
pnpm dev:web
```

默认前端开发服务由 Vite 提供，API 默认由 `apps/api` 启动配置决定。前端 API 地址可通过 `VITE_API_BASE_URL` 指向本地 API。

## 常用脚本

```bash
pnpm test        # 运行 Vitest 测试
pnpm typecheck   # 运行 workspace 包和 scripts 目录的 TypeScript 类型检查
pnpm build       # 构建所有支持 build 的 workspace 包
pnpm dev:api     # 启动 API 开发服务
pnpm dev:web     # 启动 Demo/Admin 前端
pnpm eval:manifest <manifest.json>  # 校验评估数据集 manifest，不导入 API
pnpm eval:run                      # 创建受控评估 run 并读取 metrics
pnpm smoke:production               # 对生产 API 做受控 smoke 检查
pnpm e2e:demo-web:browser           # 本地真实浏览器 E2E；输出 browserE2E=passed / blocked
pnpm readiness:deployment           # 汇总 P1/P2 本地 readiness、本地 contract smoke 与真实 production blocked 状态
pnpm db:migrate  # 执行 Prisma 数据库迁移
pnpm db:seed     # 写入初始化种子数据
```

## 真实 LLM Provider

`LLM_PROVIDER` 支持 `langchain`、`openai-compatible` 和 `openai-responses` 作为真实模型主线。推荐学习和默认 agent 主线使用 `langchain`：它会通过 LangChain `ChatOpenAI` 创建真实模型，读取 `LLM_MODEL`，优先使用 `OPENAI_API_KEY`，否则使用 `LLM_API_KEY`；配置 `LLM_BASE_URL` 后可以指向 OpenAI-compatible 网关。测试或特殊部署也可以在 production service 创建时注入 `langChainModel`，用于接入自定义 LangChain model-like 对象。

## 真实操作路径

Demo/Admin 前端的用户主线是：进入 `Provider 设置` 配置真实 OCR Provider 和真实 LLM Provider，确认 Provider API 列表显示真实 provider 已启用，再到 `新建识别` 上传 PNG/JPG/PDF 病历文件，选择 Schema、Adapter、OCR/LLM Provider 后创建识别任务。任务完成后在详情页复核字段、证据和置信度，满足权限与 green 决策条件后再进入 `写回控制` 执行 LIMS 写回。

如果没有配置真实 OCR/LLM Provider，前端显示 `Provider 待配置`，新建识别下拉为空并阻断创建；真实模型提供商等待后续提供并接入。自动化测试使用合成样本和测试替身，不作为真实用户操作路径。

## 生产 Smoke 与评估 Manifest

`pnpm readiness:deployment` 是部署交接聚合 gate，会顺序执行 typecheck、全量测试、demo-web style/mobile/build/smoke、浏览器 E2E、真实 production smoke 和本地 contract smoke。输出 JSON 与文本摘要；`exit code 2` 表示本地 readiness 可通过但真实外部条件 blocked，不能写医疗最终产品通过。

`pnpm smoke:production` 明确区分 `passed`、`blocked`、`failed`：脚本输出 `STATUS passed|blocked|failed`。缺少真实 `PRODUCTION_SMOKE_BASE_URL/EMAIL/PASSWORD` 时输出 `MODE blocked` 并列出 external sandbox、secret resolver、queue broker 缺失条件，以 exit code 2 结束；真实 API 调用异常时输出 `MODE failed`；本地 contract smoke 只用于脚本契约校验，不访问外部 OCR/LLM/LIMS；配置真实 sandbox 后默认为 `MODE real-sandbox`，按真实 API 执行 `/status`、登录、Provider 列表和 Provider health。

只有设置 `PRODUCTION_SMOKE_RUN_RECOGNITION=true` 时，真实 sandbox smoke 才会上传合成或审批后的强脱敏样本并创建识别任务；脚本会轮询 `/jobs/:id` 到 terminal 状态后再读取结果。只有再设置 `PRODUCTION_SMOKE_RUN_WRITEBACK=true` 时，才会基于本次识别结果里的 `readyFields` 调用 `/writeback`。

Provider 密钥只通过 `secretRefs` 解析。默认 `SECRET_RESOLVER_PROVIDER=env` 只代表环境变量注入；`vault`、`kms`、`secret-manager` 目前只提供 fail-fast contract，缺配置返回 `SECRET_RESOLVER_CONTRACT_INCOMPLETE`，配置完整但未接真实 SDK 时返回 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`，不能声明真实 KMS/Vault/Secret Manager 已接入。

识别队列当前默认是 `in-process`，`JobQueueAdapter.describe()` 会暴露 lease/retry/dead-letter/heartbeat 能力声明和 `QUEUE_BROKER_NOT_CONFIGURED`。`QUEUE_MODE=broker` 配置完整只代表 `configReady=true`；在真实 Redis/RabbitMQ/SQS adapter 和多实例 smoke 完成前仍是 `QUEUE_BROKER_ADAPTER_NOT_CONNECTED`，不能声明生产可靠队列通过。

`pnpm e2e:demo-web:browser` 用于本地真实浏览器 E2E 和移动端截图验收。脚本优先尝试 Playwright；没有 Playwright 时会使用系统 Chrome CDP；两者都不可用时输出 `browserE2E=blocked` 和原因。通过时截图写入 `ui-parity-screenshots/medical-e2e-current/`。该脚本不访问真实 OCR/LLM/LIMS sandbox，不能替代 `PRODUCTION_SMOKE_MODE=real-sandbox`。

真实脱敏评估样本导入前先运行：

```bash
pnpm eval:manifest evaluation-data/local-deidentified/datasets/lims-clinical-info-local.json
```

该命令只做本地预检，不上传文件、不调用 OCR/LLM、不导入 API。确认 manifest 通过校验后，可以在受控环境里显式执行导入：

```bash
pnpm eval:manifest --import evaluation-data/local-deidentified/datasets/lims-clinical-info-local.json
```

导入模式需要配置 `EVALUATION_API_BASE_URL` 和具备 `evaluation:manage` 权限的 `EVALUATION_API_ACCESS_TOKEN`。导入脚本只创建 evaluation dataset 和 sample metadata，传递 `documentRef`、`groundTruth` 和脱敏证明，不读取或上传真实病历文件字节。`evaluation-data/local-deidentified/` 和 `evaluation-data/intranet-deidentified/` 默认已加入 `.gitignore`。

导入完成后，可以配置 `EVALUATION_DATASET_ID`、`EVALUATION_PROVIDER_KEY`、可选 `EVALUATION_SCHEMA_KEY` 和 `EVALUATION_SAMPLE_LIMIT`，再执行：

```bash
pnpm eval:run
```

该命令只调用 Evaluation API 创建 run、读取 run 状态和 metrics；真正使用哪个 OCR/LLM provider 由后端生产配置和 run 参数决定。

## 文档索引

- [系统架构文档](docs/system-architecture.md)：目标架构、技术栈选型、核心模块、流程、数据架构、部署、安全和风险约束。
- [评估数据集执行规范](docs/evaluation-datasets.md)：合成样本、真实脱敏样本、ground truth、证据标注和评估边界。
- [2026-06-08 晚间交接](docs/2026-06-08-handoff.md)：今日已推送内容、验证命令、运行入口、已知风险和接手优先级。
- [2026-06-09 P2 生产化交接](docs/2026-06-09-p2-production-handoff.md)：浏览器 E2E、真实 sandbox、KMS/Vault、可靠队列和 CI smoke 参数。
- [superpowers 设计规格](docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md)：病历识别 Agent 的设计来源和目标范围。
- [superpowers 实施计划](docs/superpowers/plans/2026-06-04-medical-record-agent-product.md)：按任务拆分的产品实现计划。
- [Agent 框架对比](docs/agent-framework-comparison.md)：LangGraph、OpenAI Agents SDK、Mastra 和 LlamaIndex.TS 的项目内取舍。

## 数据安全边界

- 仓库禁止提交真实病历原图、未脱敏 OCR 文本、未脱敏 PDF、未脱敏截图、未脱敏导出 JSON 和真实密钥。
- CI 和自动化测试默认只使用合成样本、fixtures 和测试替身；它们只服务测试/CI，不作为真实用户操作路径。
- 真实脱敏样本必须标记 `deidentified=true`，并保存在本地受控目录或内网对象存储中。
- 公网模型或 OCR provider 默认不允许接收真实未脱敏病历内容。
- LIMS 写回必须经过权限、幂等、payload 校验、自动决策和审计控制。

## 当前状态

当前仓库已包含 pnpm workspace、核心类型、Core Agent 层、API 服务、Prisma 数据模型、Demo/Admin 前端、评估和架构文档。项目仍处于产品化演进阶段，真实 OCR、真实 LLM、LIMS 测试环境和真实脱敏评估样本需要按部署环境继续配置和验证。
