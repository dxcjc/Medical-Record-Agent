在 /tmp/Medical-Record-Agent 项目中实现 Phase 1 前端任务。

## 技术上下文
- 前端：medical-ui（React + Arco Design + Vite）
- 后端：apps/api（Fastify + Prisma）
- 所有 UI 文本用中文
- 设计规范：Material+Arco，白侧栏+pill高亮+蓝#3370FF

## 任务清单

### Task 1: 任务列表真分页 + 完整列（medical-ui/src/pages/JobListPage.tsx）

修改 JobListPage：
- 表格 12 列：任务ID（截断8位）、Schema中文名、文件名、状态中文标签、整体置信度、识别字段数、需复核数、Provider中文名、耗时、创建人、创建时间、操作
- 状态中文映射：completed→已完成, needs_review→需复核, running→识别中, failed→失败, queued→排队中, partial_completed→部分完成, writeback_pending→待回写, writeback_completed→已回写, writeback_failed→回写失败
- 分页组件（Arco Pagination）
- 筛选栏：状态下拉 + Schema下拉 + 搜索框

修改 hooks/useJobs.ts：
- useJobs 接受 page/pageSize/status/schemaKey/search 参数
- 返回 { items, total, page, pageSize }

修改 api/client.ts：
- jobsApi.list 支持分页参数

### Task 2: Dashboard 统计 API 前端对接（medical-ui/src/pages/DashboardPage.tsx）

后端已有 GET /api/stats/dashboard。修改 DashboardPage：
- 用新的 statsApi.getDashboard() 替代 useJobs(20)
- 4 个 KPI 卡片显示真实数据
- 最近任务表用 stats 返回的 recentAlerts

需要在 api/client.ts 新增 statsApi。

### Task 3: UI 显示名称中文化

全局搜索所有 StatusTag 或状态显示，改为中文。
修改 JobListPage、JobDetailPage、AuditPage 中的状态显示。
Provider 列显示 displayName（如果后端已返回）。

### Task 4: Schema 字段显示优化（medical-ui/src/pages/SchemaPage.tsx）

SchemaPage 字段表格从 4 列扩展为 8 列：
标签、Key、类型、必填、关键字段、LIMS映射、识别说明、枚举值

definition JSON 中的字段结构：
```
{ key, label, type, required, critical, comments, adapterHints: { limsTargetPath }, enumMap }
```

### Task 5: EvaluationPage + AuditPage 完整列

EvaluationPage 数据集列表：名称、状态、样本数、关联Schema、创建人、创建时间
EvaluationPage 运行记录：数据集名、Provider、状态、指标摘要、开始时间、耗时

AuditPage 列：时间、操作人中文名、操作类型中文、对象类型、对象ID、结果、IP地址
操作类型中文映射在页面内定义即可。

## 验证
完成后运行 `cd /tmp/Medical-Record-Agent/medical-ui && pnpm build` 确认构建通过。
将审计报告写入 /tmp/Medical-Record-Agent/PHASE1-FRONTEND-AUDIT.md。
