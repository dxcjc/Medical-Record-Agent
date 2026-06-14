# STEP3-AUDIT.md — SKILL.md + CLI 影响修复审计报告

## 概述

本次更新完成 P1-P3 新增功能的 CLI 和 SKILL.md 同步，新增 6 个 CLI 命令、更新帮助系统和 schema 发现、全面更新 SKILL.md 文档。

## 任务 1：CLI 新增命令

### 新增文件

| 文件 | 命令 | API 端点 | 状态 |
|------|------|---------|:---:|
| `apps/cli/commands/push.js` | `mra push` | `GET /results/:jobId` → `POST <endpoint>` | ✅ |
| `apps/cli/commands/stats.js` | `mra stats` | `GET /api/stats/fields?schemaKey=<key>` | ✅ |
| `apps/cli/commands/trend.js` | `mra trend` | `GET /api/stats/trend?schemaKey=<key>&days=<n>` | ✅ |
| `apps/cli/commands/delete.js` | `mra delete` | `DELETE /jobs/:id` | ✅ |
| `apps/cli/commands/rerun.js` | `mra rerun` | `POST /jobs/:id/rerun` | ✅ |
| `apps/cli/commands/export.js` | `mra export` | `GET /jobs/:id` + `GET /results/:jobId` | ✅ |

### 命令详情

#### 1. push 命令
- 用法：`mra push --endpoint <url> --job <job_id> [--token <token>]`
- 功能：获取识别结果后 POST 到外部系统
- 参数校验：`--endpoint` 和 `--job` 均为必需
- 推送 payload：`{ jobId, fields, confidence, reviewRequired, pushedAt }`

#### 2. stats 命令
- 用法：`mra stats [--schema <key>] [--format json|table]`
- 功能：展示字段识别统计
- 默认 schema：`tumor-gene-test`
- table 格式：字段、识别次数、置信度均值、复核次数、修正次数

#### 3. trend 命令
- 用法：`mra trend [--schema <key>] [--days 30] [--format json|table]`
- 功能：展示识别趋势
- 默认 30 天，支持 1-365 天范围
- table 格式：日期、总数、成功、失败

#### 4. delete 命令
- 用法：`mra delete <job_id> [--yes] [--token <token>]`
- 功能：软删除任务
- 交互确认：默认需输入 `y` 确认，`--yes` 跳过
- 使用 Node.js readline 实现确认提示

#### 5. rerun 命令
- 用法：`mra rerun <job_id> [--token <token>]`
- 功能：重新执行识别任务
- 返回新 job 信息

#### 6. export 命令
- 用法：`mra export <job_id> [--output <path>] [--token <token>]`
- 功能：导出识别结果为 JSON 文件
- 并发获取 job + result（`Promise.all`），合并后写入文件
- 默认输出 `<job_id>.json`

### index.js 更新
- ✅ 导入 6 个新命令模块
- ✅ COMMANDS 对象注册 14 个命令（原 8 + 新 6）
- ✅ showHelp() 更新，包含所有命令的用法和示例

### schema.js 更新
- ✅ 新增 6 个命令的参数 schema 定义
- ✅ 所有 schema 包含 command、description、usage、flags

## 任务 2：SKILL.md 全面更新

### 2.1 命令参考表更新
- ✅ 新增 push、stats、trend、delete、rerun、export 6 个命令文档
- ✅ 每个命令包含用法、参数说明、API 端点

### 2.2 新增 API 端点文档
- ✅ 核心任务 API（7 个端点）
- ✅ 推送 API v1（3 个端点）
- ✅ 统计 API（2 个端点）
- ✅ 反馈 API（4 个端点）
- ✅ 回写 API（3 个端点）
- ✅ Schema 管理 API（8 个端点）
- ✅ 其他 API（8 个端点）

### 2.3 新增前端页面文档
- ✅ WritebackPage (`/writeback`) — 回写管理
- ✅ FeedbackPage (`/feedback`) — 反馈管理
- ✅ AuditPage 增强 — 操作审计 + 质量报告
- ✅ EvaluationPage 增强 — 评测系统
- ✅ SchemaPage 字段卡片 — Schema 编辑器
- ✅ JobDetailPage 追溯 — 追溯链路

### 2.4 更新架构说明
- ✅ 系统架构图（CLI / Web UI / API Server / Database）
- ✅ 推送 API 架构（外部系统接入）
- ✅ 统计聚合架构（RecognitionResult + Feedback 聚合）
- ✅ 数据流图（上传 → 识别 → 审核 → 回写）

### 2.5 新增 pitfalls.md
- ✅ 创建 `skills/medical-record-agent/pitfalls.md`
- ✅ 10 个陷阱条目覆盖：Vitest (4)、趋势图 API (3)、CLI (3)

## 验证结果

| 验证项 | 结果 | 说明 |
|--------|:---:|------|
| `mra --help` 显示所有 14 个命令 | ✅ | 包含新命令用法和示例 |
| `mra push --help` / 无参数 | ✅ | 显示用法提示 |
| `mra stats --help` / 无参数 | ✅ | 默认 schema，尝试调用 API |
| `mra trend --help` / 无参数 | ✅ | 默认 schema+days，尝试调用 API |
| `mra delete --help` / 无参数 | ✅ | 显示用法提示 |
| `mra rerun --help` / 无参数 | ✅ | 显示用法提示 |
| `mra export --help` / 无参数 | ✅ | 显示用法提示 |
| `mra schema push/stats/trend/delete/rerun/export` | ✅ | 所有 schema 输出正确 |
| `pnpm typecheck` | ✅ | 通过，无类型错误 |
| SKILL.md 内容与实际一致 | ✅ | 14 个 CLI 命令、35+ API 端点、10 个前端页面 |

## 变更文件清单

| 文件 | 操作 |
|------|------|
| `apps/cli/commands/push.js` | 新建 |
| `apps/cli/commands/stats.js` | 新建 |
| `apps/cli/commands/trend.js` | 新建 |
| `apps/cli/commands/delete.js` | 新建 |
| `apps/cli/commands/rerun.js` | 新建 |
| `apps/cli/commands/export.js` | 新建 |
| `apps/cli/index.js` | 修改（+6 命令注册 + 帮助文本）|
| `apps/cli/commands/schema.js` | 修改（+6 schema 定义）|
| `skills/medical-record-agent/SKILL.md` | 重写（183 → ~340 行）|
| `skills/medical-record-agent/pitfalls.md` | 新建 |

## 代码风格

所有新 CLI 命令遵循已有模式：
- 使用 `apiRequest()` 发起 API 调用
- 使用 `output()` 处理 `--format json|table` 输出
- 使用 `parseArgs()` 解析参数
- 中文错误提示和注释
- ES Module (`export async function`)
