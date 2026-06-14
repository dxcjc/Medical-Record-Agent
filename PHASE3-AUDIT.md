# Phase 3 审计报告

## 完成状态

| 任务 | 描述 | 状态 |
|------|------|------|
| 任务 1 | JobDetailPage 追溯视图 | ✅ 完成 |
| 任务 2 | 质量审计页（质量报告 Tab） | ✅ 完成 |
| 任务 3 | 操作审计增强（筛选/分页/展开/跳转） | ✅ 完成 |
| 任务 4 | WritebackPage 回写管理 | ✅ 完成 |
| 任务 5 | FeedbackPage 反馈管理 | ✅ 完成 |
| 任务 6 | EvaluationPage 评测系统增强 | ✅ 完成 |

## 修改的文件列表

### 后端（apps/api）

| 文件 | 修改内容 |
|------|---------|
| `src/repositories/audit.repository.ts` | 新增 `page`/`pageSize`/`objectType` 参数，分页查询返回 `{ items, total, page, pageSize }`，include actorUser |
| `src/repositories/feedback.repository.ts` | 新增 `listAll()` 分页查询 + `getFieldStats()` 字段统计 |
| `src/repositories/writeback.repository.ts` | 新增 `listAll()` 历史分页查询 |
| `src/routes/audit.routes.ts` | 接口新增 `objectType`/`page`/`pageSize` 参数 |
| `src/routes/feedback.routes.ts` | 新增 `GET /feedback/all` 和 `GET /feedback/stats` 端点 |
| `src/routes/writeback.routes.ts` | 新增 `GET /writeback/history` 端点，接口新增 `listHistory` 方法 |
| `src/routes/route-dtos.ts` | `auditListQuerySchema` 新增 `objectType`/`page`/`pageSize` 字段 |
| `src/services/api-services.ts` | feedbackService 新增 `listAll`/`getFieldStats`，writebackService 新增 `listHistory` |
| `src/bootstrap/production-services.ts` | 适配新的 `listRecent` 返回结构，新增 `listHistory` |
| `src/repositories/audit.repository.test.ts` | 更新断言匹配新 include 参数，新增 3 个分页/筛选测试 |
| `src/routes/writeback.routes.test.ts` | 所有 mock 新增 `listHistory` |
| `src/routes/base.routes.test.ts` | mock 新增 `listAll`/`getFieldStats`/`listHistory` |
| `src/routes/route-service-contracts.test.ts` | mock 新增缺失方法 |
| `src/server.test.ts` | mock 新增缺失方法 |
| `src/services/api-services.test.ts` | mock 新增 `listAll`/`getFieldStats` |
| `src/repositories/repositoryDatabase.integration.test.ts` | 适配新的分页返回结构 |

### 前端（medical-ui）

| 文件 | 修改内容 |
|------|---------|
| `src/api/types.ts` | 新增 `FeedbackSubmission`、`WritebackAttempt`、`FeedbackFieldStat` 类型 |
| `src/api/client.ts` | `auditApi.listPaginated` 支持 page/pageSize/objectType；新增 `feedbackApi.listAll`/`getFieldStats`；新增 `writebackApi.eligible`/`execute`/`history` |
| `src/hooks/useAudit.ts` | 新增 `usePaginatedAudit` hook（服务端分页） |
| `src/icons/appIcons.tsx` | 新增 `IconMessageSquare`、`IconRepeat`、`IconRotateCcw`、`IconGitBranch`、`IconChevronRight`、`IconChevronDown` |
| `src/layout/AppLayout.tsx` | 导航栏新增"回写管理"和"反馈管理"菜单项，PAGE_TITLES 更新 |
| `src/App.tsx` | 新增 `/feedback` 和 `/writeback` 路由 |
| `src/pages/JobDetailPage.tsx` | 新增 Tabs（识别结果/追溯链路），追溯链路展示完整决策链路（原始文件→OCR→RAG→LLM→校验），每个节点可展开 |
| `src/pages/AuditPage.tsx` | 完全重写：新增 Tabs（操作审计/质量报告）；操作审计增加筛选栏/服务端分页/可展开 metadata 行/可点击对象 ID/中文操作类型；质量报告增加 KPI 卡片/趋势图/TOP5 字段/Schema 分布 |
| `src/pages/EvaluationPage.tsx` | 完全重写：新增 KPI 卡片、创建数据集表单、导入样本弹窗（JSON）、创建评测运行弹窗、字段级准确率/召回率/F1 详情、JSON 报告导出 |
| `src/pages/WritebackPage.tsx` | **新增**：可回写任务列表、回写确认弹窗（预览字段值）、回写历史列表 |
| `src/pages/FeedbackPage.tsx` | **新增**：全局反馈列表、按字段/任务筛选、字段反馈统计 TOP10、反馈详情（原始值 vs 修正值 + 原因） |

## 新增的 API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/feedback/all` | 全局反馈列表（跨任务），支持 fieldKey/jobId/page/pageSize |
| GET | `/feedback/stats` | 按字段统计反馈数量 |
| GET | `/writeback/history` | 回写历史列表，支持 page/pageSize |
| GET | `/audit` | 增强：新增 objectType/page/pageSize 查询参数 |

## 新增的前端页面/组件

| 页面/组件 | 路径 | 描述 |
|----------|------|------|
| WritebackPage | `/writeback` | 回写管理页面 |
| FeedbackPage | `/feedback` | 反馈管理页面 |
| TraceView | 内嵌 JobDetailPage | 追溯链路可视化组件 |
| TraceNodeCard | 内嵌 JobDetailPage | 可展开的追溯节点卡片 |
| QualityReportTab | 内嵌 AuditPage | 质量报告 Tab |
| AuditLogTab | 内嵌 AuditPage | 增强的操作审计 Tab |
| CssTrendChart | 内嵌 AuditPage | 纯 CSS 实现的趋势图 |
| CreateDatasetModal | 内嵌 EvaluationPage | 创建数据集弹窗 |
| ImportSamplesModal | 内嵌 EvaluationPage | 导入样本弹窗 |
| CreateRunModal | 内嵌 EvaluationPage | 创建评测运行弹窗 |
| MetricsDetailModal | 内嵌 EvaluationPage | 字段级指标详情弹窗 |
| WritebackConfirmModal | 内嵌 WritebackPage | 回写确认弹窗 |

## 测试结果

- **后端路由测试**：80/80 通过（含新增的 3 个审计分页测试）
- **前端 TypeScript**：0 错误
- **前端构建**：成功（Vite build 通过）
- **已知失败**：2 个预先存在的 storage/upload 测试失败（非本次修改引起）

## 遗留问题

1. **趋势图数据**：质量报告中的识别率趋势图当前使用静态示例数据，需要后端提供按天聚合的实际统计 API
2. **反馈详情弹窗**：当前使用右下角浮窗实现，可考虑改为 Modal 弹窗以获得更好的用户体验
3. **评测运行指标**：`MetricsDetailModal` 假设后端返回的 `metadata.breakdown` 中包含字段级指标，实际结构取决于 evaluation runner 实现
4. **回写执行**：当前 `writebackApi.execute` 直接调用后端 LIMS 适配器，生产环境可能需要更完善的错误处理和重试逻辑
5. **前端无单元测试**：Phase 3 新增的前端组件未编写 Vitest 单元测试（前端项目未配置 Vitest），建议后续补充
