---
name: medical-record-agent
description: "医疗病历识别 Agent：上传病历图片→OCR→LLM结构化抽取→验证→回写。当用户需要识别病历、查看识别结果、纠正字段、管理知识库、推送结果、查看统计、导出数据时使用。"
cli_version: ">=0.1.0"
---

# Medical Record Agent Skill

通过 `mra` 命令行工具调用医疗病历识别能力。

## 严格禁止 (NEVER DO)
- 不要使用 mra 命令以外的方式调用识别 API（禁止手动 curl）
- 不要编造 job_id、file_id 等标识符，必须从命令返回中提取
- 不要猜测字段名，先用 `mra result <job_id> --format json` 查看实际字段
- 不要在未经确认的情况下执行 `mra delete`（使用 `--yes` 跳过确认仅限批量脚本）
- 不要假设 stats/trend 返回的数据结构，始终使用 `--format json` 获取原始格式

## 严格要求 (MUST DO)
- 所有命令加 `--format json` 获取可解析输出（需要结构化数据时）
- 纠正字段前必须先用 `mra result` 查看当前值
- 识别完成后必须检查置信度，<80% 的字段需要人工审核
- 推送前必须确认 job 状态为 `completed`，且已 review 需审核字段
- 删除任务前必须确认 job_id 正确，删除操作不可逆
- 导出结果前确保 job 已完成，未完成的 job 导出数据不完整

## 核心流程

### 意图判断决策树

| 用户说... | 应该用 | 不要用 |
|-----------|--------|--------|
| "识别这张病历/图片/报告" | `mra recognize` | — |
| "识别结果是什么" | `mra result` | — |
| "任务进度怎么样了" | `mra status` | — |
| "XX字段不对，应该是YY" | `mra feedback` | — |
| "有哪些识别 schema" | `mra schemas` | — |
| "搜索知识库" | `mra knowledge search` | — |
| "查看最近的任务" | `mra jobs` | — |
| "这个命令怎么用" | `mra schema <cmd>` | — |
| "推送到XX系统/LIMS" | `mra push` | — |
| "字段识别统计/准确率" | `mra stats` | — |
| "识别趋势/工作量报表" | `mra trend` | — |
| "删除/移除这个任务" | `mra delete` | — |
| "重跑/重新识别" | `mra rerun` | — |
| "导出/下载结果" | `mra export` | — |

### 完整识别流程

```
Step 1: mra recognize --file /path/to/scan.jpg --format json
        → 返回 job_id

Step 2: mra status <job_id>
        → 等待 status 变为 completed（通常 30-60 秒）

Step 3: mra result <job_id> --format json
        → 返回所有字段值、置信度、证据

Step 4: 如果有字段需要纠正
        mra feedback <job_id> --field <key> --value <correct_value>

Step 5: （可选）推送到外部系统
        mra push --endpoint https://lims.example.com/api/ingest --job <job_id>

Step 6: （可选）导出本地备份
        mra export <job_id> --output result.json
```

### 纠正流程

```
Step 1: mra result <job_id> --format json
        → 查看当前所有字段值

Step 2: mra feedback <job_id> --field patientName --value "张三"
        → 纠正单个字段

Step 3: 重复 Step 2 纠正其他字段
```

### 批量工作流

```
# 查看近期工作量
mra trend --days 7

# 查看字段质量
mra stats --schema tumor-gene-test

# 导出多个任务结果
mra export <job_id_1> --output job1.json
mra export <job_id_2> --output job2.json

# 清理失败任务
mra delete <failed_job_id> --yes
```

## 命令参考

### recognize — 识别病历

```bash
mra recognize --file <path> [--schema <key>] [--format json]
```

- `--file` (必需): 病历图片路径
- `--schema` (可选): 识别 schema，默认 `tumor-gene-test`

输出示例:
```json
{
  "job_id": "cmqxxx",
  "status": "queued",
  "schema": "tumor-gene-test",
  "created": "2026-06-13T12:00:00Z"
}
```

### status — 查询状态

```bash
mra status <job_id> [--format json]
```

状态值: `queued` → `running` → `completed` / `failed`

### result — 获取结果

```bash
mra result <job_id> [--format json|table]
```

JSON 输出包含:
- `fields`: 所有识别字段（key → {value, confidence, needsReview, evidence}）
- `confidence`: 总置信度
- `reviewRequired`: 是否需要人工审核

### feedback — 纠正字段

```bash
mra feedback <job_id> --field <key> --value <value>
```

### push — 推送结果

```bash
mra push --endpoint <url> --job <job_id> [--format json]
```

- `--endpoint` (必需): 外部系统接收 URL
- `--job` (必需): 任务 ID

推送 payload 包含 `jobId`, `fields`, `confidence`, `reviewRequired`, `pushedAt`。

### stats — 字段统计

```bash
mra stats [--schema <key>] [--format json|table]
```

- `--schema` (可选): Schema key，默认 `tumor-gene-test`

table 格式: 字段名、识别次数、置信度均值、复核次数、修正次数

API: `GET /api/stats/fields?schemaKey=<key>`

### trend — 趋势数据

```bash
mra trend [--schema <key>] [--days 30] [--format json|table]
```

- `--schema` (可选): Schema key，默认 `tumor-gene-test`
- `--days` (可选): 统计天数，默认 30

table 格式: 日期、总数、成功、失败

API: `GET /api/stats/trend?schemaKey=<key>&days=<n>`

### delete — 删除任务

```bash
mra delete <job_id> [--yes] [--format json]
```

- `--yes` / `-y`: 跳过确认提示
- 软删除，数据不会物理移除

### rerun — 重跑任务

```bash
mra rerun <job_id> [--format json]
```

重新执行已有的识别任务，返回新的 job 信息。

### export — 导出结果

```bash
mra export <job_id> [--output <path>] [--format json]
```

- `--output` / `-o`: 输出文件路径，默认 `<job_id>.json`
- 同时获取任务信息和识别结果，合并导出

### knowledge — 知识库

```bash
mra knowledge search <query>     # 搜索
mra knowledge list [--kind <type>]  # 列表
```

kind 类型: `cancer_alias`, `medical_term`, `lims_dictionary`, `field_description`

### schemas — 列出 schema

```bash
mra schemas [--format json]
```

### schema — 查看命令参数

```bash
mra schema                # 列出所有命令
mra schema recognize      # 查看 recognize 的参数详情
```

### jobs — 列出任务

```bash
mra jobs [--status <status>] [--limit <n>] [--format json]
```

## 全局选项

| 选项 | 短名 | 说明 | 默认 |
|------|:---:|------|------|
| `--format` | `-f` | 输出格式: json / table | table |
| `--api-url` | | API 地址 | http://localhost:3000 |
| `--verbose` | `-v` | 详细日志 | false |
| `--help` | `-h` | 显示帮助 | — |
| `--token` | | JWT 认证 token | — |
| `--yes` | `-y` | 跳过确认（delete 命令） | false |

## 环境变量

| 变量 | 说明 |
|------|------|
| `MRA_API_URL` | API 地址（默认 http://localhost:3000）|
| `MRA_API_TOKEN` | JWT 认证 token（必需，通过 `--token` 或环境变量传入）|

## 认证

所有命令需要 JWT token。获取方式：

```bash
# 方式1：环境变量
export MRA_API_TOKEN="your-jwt-token"
mra jobs

# 方式2：命令行参数
mra jobs --token "your-jwt-token"
```

## API 端点参考

### 核心任务 API

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/files` | POST | 上传文件元数据 | job:create |
| `/files/:id/content` | GET | 下载文件 | job:read |
| `/jobs` | POST | 创建识别任务 | job:create |
| `/jobs/:id` | GET | 获取任务详情 | job:read |
| `/jobs/:id` | DELETE | 软删除任务 | job:create |
| `/jobs/:id/rerun` | POST | 重跑任务 | job:create |
| `/results/:jobId` | GET | 获取识别结果 | job:read |

### 推送 API (v1)

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/api/v1/jobs` | GET | 分页任务列表 | job:read |
| `/api/v1/jobs/:id/result` | GET | 获取任务结果 | job:read |
| `/api/v1/jobs/:id/result/fields` | GET | 仅获取字段 | job:read |

### 统计 API

| 端点 | 方法 | 说明 |
|------|:---:|------|
| `/api/stats/fields?schemaKey=<key>` | GET | 字段识别统计（识别次数、置信度均值、复核/修正次数）|
| `/api/stats/trend?schemaKey=<key>&days=<n>` | GET | 趋势数据（按日聚合：总数、成功、失败）|

### 反馈 API

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/feedback` | POST | 提交字段纠正 | feedback:create |
| `/feedback?jobId=<id>` | GET | 按任务查询反馈 | feedback:create |
| `/feedback/all` | GET | 全局反馈列表（支持 fieldKey、jobId、分页筛选）| feedback:create |
| `/feedback/stats` | GET | 按字段统计反馈次数 | feedback:create |

### 回写 API

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/writeback/eligible` | GET | 可回写任务列表 | writeback:execute |
| `/writeback` | POST | 执行回写（需 confirmed: true）| writeback:execute |
| `/writeback/history` | GET | 回写历史（分页）| writeback:execute |

### Schema 管理 API

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/schemas` | GET | 列出活跃 schema | schema:read |
| `/schemas/drafts` | POST | 创建草稿 | schema:draft |
| `/schemas/drafts/:id` | PUT | 更新草稿 | schema:draft |
| `/schemas/drafts/:id/validate` | POST | 验证草稿 | schema:draft |
| `/schemas/drafts/:id/publish` | POST | 发布版本 | schema:publish |
| `/schemas/versions/:id/deactivate` | POST | 停用版本 | schema:publish |
| `/schemas/versions/:id/rollback` | POST | 回滚版本 | schema:publish |
| `/schemas/:schemaKey/compare` | GET | 版本对比 | schema:draft |

### 其他 API

| 端点 | 方法 | 说明 | 权限 |
|------|:---:|------|------|
| `/auth/login` | POST | 用户登录 | — |
| `/auth/logout` | POST | 用户登出 | — |
| `/audit` | GET | 操作审计日志 | audit:read |
| `/knowledge` | GET/POST/PUT/DELETE | 知识库 CRUD | — |
| `/providers` | GET | 列出服务提供方 | provider:manage |
| `/providers/:key` | PUT | 保存提供方配置 | provider:manage |
| `/providers/:key/health` | POST | 提供方健康检查 | provider:manage |
| `/evaluations/datasets` | GET/POST | 评测数据集 | evaluation:manage |
| `/evaluations/runs` | GET/POST | 评测运行 | evaluation:manage |
| `/health` | GET | 健康检查 | — |
| `/status` | GET | 服务状态 | — |

## 前端页面

### 主要页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 主控面板，任务概览 |
| `/jobs` | JobListPage | 任务列表，分页/筛选 |
| `/jobs/:id` | JobDetailPage | 任务详情，字段卡片 + 追溯链路 |
| `/schemas` | SchemaPage | Schema 管理，字段卡片编辑器 |
| `/knowledge` | KnowledgePage | 知识库管理 |
| `/audit` | AuditPage | 操作审计 + 质量报告 |
| `/evaluation` | EvaluationPage | 评测系统（数据集管理、运行评测、查看指标）|
| `/feedback` | FeedbackPage | 反馈管理（全局反馈列表、统计）|
| `/writeback` | WritebackPage | 回写管理（可回写列表、执行回写、历史记录）|
| `/providers` | ProviderPage | 服务提供方配置 |

### JobDetailPage 追溯功能

- 字段卡片：每个字段展示值、置信度、证据、审核状态
- 追溯链路：从原始文件到识别结果的完整处理链
- 反馈历史：字段纠正记录
- 操作：重跑、导出、推送

### SchemaPage 字段卡片编辑器

- Schema 版本管理：草稿 → 验证 → 发布
- 字段卡片：可视化编辑字段定义（key、类型、约束、描述）
- 版本对比：左右对比两个版本差异
- 回滚：回退到历史版本

### WritebackPage 回写管理

- 可回写列表：展示已完成且已审核的任务
- 执行回写：确认后推送到目标系统
- 回写历史：分页查看历史记录

### FeedbackPage 反馈管理

- 全局反馈列表：按字段、任务筛选
- 反馈统计：按字段统计纠正次数
- 批量操作：支持多条反馈处理

### AuditPage 增强

- 操作审计：按操作类型、用户、对象筛选
- 质量报告：识别准确率、字段修正率统计

### EvaluationPage 增强

- 数据集管理：创建数据集、导入样本
- 运行评测：选择数据集执行评测
- 指标查看：准确率、召回率、F1 分数

## 架构说明

### 系统架构

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐
│  CLI    │────▶│  API Server  │────▶│  Database    │
│  (mra)  │     │  (Fastify)   │     │  (Prisma)    │
└─────────┘     └──────┬───────┘     └──────────────┘
                       │
┌─────────┐            │
│  Web UI │────────────┘
│  (Vite) │
└─────────┘
```

### 推送 API 架构

```
CLI / Web ──▶ API Server ──▶ 外部系统 (LIMS/HIS)
              │
              ├── GET /results/:jobId   (获取识别结果)
              └── POST <endpoint>       (推送到外部)
```

- CLI `mra push` 命令直接从 API 获取结果并 POST 到外部 endpoint
- Web 端推送通过 `/api/v1/jobs/:id/result` 获取结果后转发

### 统计聚合架构

```
RecognitionResult ──▶ stats.service ──▶ /api/stats/fields
                     │
Feedback ────────────┘
                     │
RecognitionResult ──▶ stats.service ──▶ /api/stats/trend
                     (按日 GROUP BY)
```

- 字段统计聚合 `RecognitionResult` + `Feedback` 数据
- 趋势统计按日聚合，区分 extracted/failed

### 数据流

```
用户上传图片 → POST /files (元数据) → POST /jobs (创建任务)
  → 任务入队 → OCR 识别 → LLM 结构化抽取 → 验证 → 结果存储
  → 人工审核（可选）→ 反馈纠正 → 回写推送
```

## 错误处理

1. 遇到错误，加 `--verbose` 重试一次
2. 如果 API 不可达，检查服务是否启动: `curl http://localhost:3000/health`
3. 如果识别失败，查看 job 状态: `mra status <job_id> --format json`
4. 认证失败时，检查 API 的 JWT_SECRET 配置
5. 推送失败时，检查 endpoint URL 是否可达，以及返回的 HTTP 状态码
6. 统计为空时，确认 schemaKey 是否正确，以及是否有已完成的任务

## 安装

```bash
# 全局链接
cd apps/cli && npm link

# 或直接运行
node apps/cli/index.js recognize --file scan.jpg
```
