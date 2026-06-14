在 /tmp/Medical-Record-Agent 项目中实现 Phase 3 的 6 个任务。

## 任务清单

### 任务1: JobDetailPage 追溯视图
在 JobDetailPage 中新增 Tab 切换（"识别结果" / "追溯链路"）。
追溯链路展示完整决策链路：
1. 原始文件 — 文件名、大小
2. OCR识别 — Provider、耗时、输出blocks数
3. RAG知识检索 — 检索query、命中条目列表(title+score)、未命中条目
4. LLM抽取 — Provider、模型、token用量、耗时
5. 校验&决策 — 每个字段的decision + issues + 置信度
每个节点可展开详情。数据源：result.extraction.trace 和 result.evidence（已有）。

### 任务2: 质量审计页
在 AuditPage 新增"质量报告" Tab：
- 时间范围选择器 + Schema选择器
- 4个KPI卡片（总任务、识别率、需复核率、平均耗时）
- 识别率趋势折线图（按天，用简单的 CSS 实现，不引入图表库）
- 最常出错字段TOP5（点击跳转Schema字段卡片）
- 按Schema分布统计
后端：复用 GET /api/stats/fields 和 GET /api/stats/dashboard

### 任务3: 操作审计增强
改造 AuditPage：
- 加筛选栏（操作人/操作类型/时间范围/对象类型）
- 真分页（服务端分页，改 auditLogRepository 支持 page/pageSize）
- 行可展开看 metadata JSON
- 对象ID可点击跳转（任务ID→JobDetailPage，SchemaID→SchemaPage）
- 操作类型显示中文

### 任务4: WritebackPage
新增页面 /writeback：
- 可回写任务列表（GET /writeback/eligible）
- 每行：任务ID、Schema中文名、识别结果摘要、操作（回写/详情）
- 回写确认弹窗（预览将推送的字段值）
- 回写历史列表
- 导航栏新增"回写管理"菜单项

### 任务5: FeedbackPage
新增页面 /feedback：
- 全局反馈列表（跨任务）
- 按任务/字段/时间筛选
- 按字段统计：哪些字段反馈最多（最容易出错）
- 反馈详情：原始值 vs 修正值 + 原因
- 导航栏新增"反馈管理"菜单项

### 任务6: 评测系统增强
增强 EvaluationPage：
- 创建数据集表单（名称 + 关联Schema）
- 导入样本（上传ground truth JSON）
- 创建评测运行（选择数据集 + Provider）
- 评测结果详情（字段级准确率/召回率/F1）
- 评测报告导出（JSON）

## 技术上下文

- 前端：medical-ui（React + Arco Design + Vite），端口9911
- 后端：apps/api（Fastify + Prisma + PostgreSQL），端口3000
- 导航栏：medical-ui/src/components/AppLayout.tsx 的 menuItems
- 现有hooks：useJobs, useSchemas, useResult 等在 medical-ui/src/hooks/
- 现有API client：medical-ui/src/api/client.ts
- 审计日志API：useAuditLog hook 已有
- 反馈API：feedbackApi 已有（submit, listByJob）
- 评测API：evaluationApi 已有（createDataset, importSamples, createRun, getMetrics）
- 回写API：writebackApi 已有（eligible, execute）
- 测试框架：vitest

## 重要规则

1. 遵循 Superpowers 流程：读 CLAUDE.md 了解核心规则
2. 按 TDD 流程：先写测试再实现
3. 不要问问题，直接开始工作
4. 所有UI文本用中文
5. 完成后将审计报告写入 PHASE3-AUDIT.md，包含：
   - 每个任务的完成状态
   - 修改的文件列表
   - 新增的API端点
   - 新增的前端页面/组件
   - 测试结果
   - 遗留问题
