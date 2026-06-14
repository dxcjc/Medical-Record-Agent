# Step 3: SKILL.md + CLI 影响修复

项目路径: /tmp/Medical-Record-Agent

## 背景
P1-P3 新增了大量 API 和前端功能，但 CLI 和 SKILL.md 没有同步更新。需要：
1. CLI 新增命令覆盖新 API
2. SKILL.md 更新为反映当前系统全貌

## 任务 1：CLI 新增命令

在 `apps/cli/commands/` 下新增以下命令：

### 1.1 push 命令（推送 API）
- 文件：`apps/cli/commands/push.js`
- 用法：`mra push --endpoint <url> --job <job_id> [--token <token>]`
- 功能：调用 `POST /api/v1/jobs/:id/result` 将识别结果推送到外部系统
- 支持 `--format json` 输出推送结果

### 1.2 stats 命令（字段统计）
- 文件：`apps/cli/commands/stats.js`
- 用法：`mra stats [--schema <key>] [--format json|table]`
- 功能：调用 `GET /api/stats/fields?schemaKey=xxx` 展示字段识别统计
- table 格式：字段名、识别次数、置信度均值、复核次数、修正次数

### 1.3 trend 命令（趋势图数据）
- 文件：`apps/cli/commands/trend.js`
- 用法：`mra trend [--schema <key>] [--days 30] [--format json|table]`
- 功能：调用 `GET /api/stats/trend?schemaKey=xxx&days=30` 展示趋势
- table 格式：日期、总数、成功、失败

### 1.4 delete 命令（删除任务）
- 文件：`apps/cli/commands/delete.js`
- 用法：`mra delete <job_id> [--token <token>]`
- 功能：调用 `DELETE /api/jobs/:id` 软删除任务
- 需要确认：`--yes` 跳过确认

### 1.5 rerun 命令（重跑任务）
- 文件：`apps/cli/commands/rerun.js`
- 用法：`mra rerun <job_id> [--token <token>]`
- 功能：调用 `POST /api/jobs/:id/rerun` 重新执行识别

### 1.6 export 命令（导出结果）
- 文件：`apps/cli/commands/export.js`
- 用法：`mra export <job_id> [--output <path>] [--token <token>]`
- 功能：调用 `GET /api/jobs/:id/export` 导出 JSON 文件

### 1.7 update index.js
- 在 COMMANDS 对象中注册所有新命令
- 更新 showHelp() 帮助文本

## 任务 2：SKILL.md 全面更新

更新 `skills/medical-record-agent/SKILL.md`：

### 2.1 命令参考表更新
添加新命令：push, stats, trend, delete, rerun, export

### 2.2 新增 API 端点文档
- 推送 API：`POST /api/v1/jobs`, `POST /api/v1/jobs/:id/result`
- 统计 API：`GET /api/stats/fields`, `GET /api/stats/trend`
- 反馈 API：`GET /feedback/all`, `GET /feedback/stats`
- 回写 API：`POST /writeback/execute`, `GET /writeback/history`
- 任务 CRUD：`DELETE /api/jobs/:id`, `POST /api/jobs/:id/rerun`, `GET /api/jobs/:id/export`

### 2.3 新增前端页面文档
- WritebackPage (`/writeback`) — 回写管理
- FeedbackPage (`/feedback`) — 反馈管理
- AuditPage 增强 — 操作审计 + 质量报告
- EvaluationPage 增强 — 评测系统
- SchemaPage 字段卡片 — Schema 编辑器
- JobDetailPage 追溯 — 追溯链路

### 2.4 更新架构说明
- 添加推送 API 架构（外部系统接入）
- 添加统计聚合架构
- 更新数据流图

### 2.5 更新 pitfalls.md
- 添加 Vitest 测试相关陷阱
- 添加趋势图 API 使用注意事项

## 验证标准
- 所有新 CLI 命令 `--help` 正常
- `mra --help` 显示所有命令
- `pnpm typecheck` 通过
- SKILL.md 内容与实际 API/前端一致
- 生成 STEP3-AUDIT.md 审计报告
