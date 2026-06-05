# Medical Record Agent

Medical Record Agent 是一个基于 TypeScript 的通用病历识别 Agent 项目。它面向病历图片、PDF、扫描件和已有 OCR 文本，输出结构化字段候选、字段证据、置信度、质量告警和可选业务系统 payload。

项目当前以 LIMS 临床信息字段作为第一套默认 preset，但架构目标不是只服务 LIMS。核心能力按 Schema、Provider、Agent 工作流、评估、反馈、权限审计和写回治理拆分，后续可以扩展到更多医疗文档结构化和业务系统集成场景。

## 核心能力

- 病历文件接收、预处理、OCR 文本块归并和质量告警。
- 基于字段 Schema 的结构化抽取、证据定位、置信度输出和字段归一。
- 基于 LangGraph.js 的 Agent 工作流编排，覆盖 OCR、RAG、抽取、校验、自动决策、写回和评估节点。
- 基于 LangChain.js、OpenAI-compatible Provider、OpenAI Responses Provider 和 Mock Provider 的模型调用抽象。
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
| 测试 | Vitest、pg-mem、Mock Provider |

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
pnpm typecheck   # 运行所有 workspace 包的 TypeScript 类型检查
pnpm build       # 构建所有支持 build 的 workspace 包
pnpm dev:api     # 启动 API 开发服务
pnpm dev:web     # 启动 Demo/Admin 前端
pnpm db:migrate  # 执行 Prisma 数据库迁移
pnpm db:seed     # 写入初始化种子数据
```

## 文档索引

- [系统架构文档](docs/system-architecture.md)：目标架构、技术栈选型、核心模块、流程、数据架构、部署、安全和风险约束。
- [评估数据集执行规范](docs/evaluation-datasets.md)：合成样本、真实脱敏样本、ground truth、证据标注和评估边界。
- [superpowers 设计规格](docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md)：病历识别 Agent 的设计来源和目标范围。
- [superpowers 实施计划](docs/superpowers/plans/2026-06-04-medical-record-agent-product.md)：按任务拆分的产品实现计划。
- [Agent 框架对比](docs/agent-framework-comparison.md)：LangGraph、OpenAI Agents SDK、Mastra 和 LlamaIndex.TS 的项目内取舍。

## 数据安全边界

- 仓库禁止提交真实病历原图、未脱敏 OCR 文本、未脱敏 PDF、未脱敏截图、未脱敏导出 JSON 和真实密钥。
- CI 和自动化测试默认只使用合成样本、fixtures、Mock OCR Provider 和 Mock Model Provider。
- 真实脱敏样本必须标记 `deidentified=true`，并保存在本地受控目录或内网对象存储中。
- 公网模型或 OCR provider 默认不允许接收真实未脱敏病历内容。
- LIMS 写回必须经过权限、幂等、payload 校验、自动决策和审计控制。

## 当前状态

当前仓库已包含 pnpm workspace、核心类型、Core Agent 层、API 服务、Prisma 数据模型、Demo/Admin 前端、评估和架构文档。项目仍处于产品化演进阶段，真实 OCR、真实 LLM、LIMS 测试环境和真实脱敏评估样本需要按部署环境继续配置和验证。
