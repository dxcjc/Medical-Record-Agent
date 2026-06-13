在 /tmp/Medical-Record-Agent 实现 Phase 3：评测追溯 + 审计闭环。

## 技术上下文
- 前端：medical-ui（React + Arco Design + Vite）
- 后端：apps/api（Fastify + Prisma）
- 审计日志表 AuditLog 已有
- 评测系统骨架已有（EvaluationPage、evaluation.routes.ts）
- 回写 API 已有（writeback.routes.ts）
- 反馈 API 已有（feedback.routes.ts）

## Task 1: JobDetailPage 追溯视图

在 JobDetailPage 新增 Tab 切换（"识别结果" / "追溯链路"）。

追溯链路用时间线/流程图展示：
1. 原始文件（文件名、大小）
2. OCR 识别（Provider、耗时、blocks 数）
3. RAG 知识检索（命中条目列表）
4. LLM 抽取（Provider、模型、token 用量、耗时）
5. 校验 & 决策（每个字段 decision + issues）

数据来源：job.trace 数组 + result.extraction + result.evidence。

## Task 2: WritebackPage

新增页面 /writeback：
- 可回写任务列表（调 GET /writeback/eligible）
- 每行：任务ID、Schema、识别结果摘要、操作按钮
- 回写确认弹窗（预览字段值）
- 回写历史（从 job.trace 中 filter writeback 相关记录）

需要新增路由和菜单项。

## Task 3: FeedbackPage

新增页面 /feedback：
- 全局反馈列表（跨任务）
- 筛选：按字段/时间
- 列：任务ID、字段名、原始值、修正值、原因、提交时间、提交人
- 按字段统计：哪些字段反馈最多

后端已有 GET /api/feedback，前端新增页面。

## Task 4: 质量审计

在 AuditPage 新增"质量报告" Tab：
- 4 个 KPI 卡片（总任务、识别率、需复核率、平均耗时）
- 最常出错字段 TOP 5
- 按 Schema 分布

后端新增 GET /api/stats/quality?days=7&schemaKey=xxx

## Task 5: 操作审计增强

AuditPage 操作日志 Tab 增强：
- 筛选栏（操作人/操作类型/时间范围）
- 真分页
- 行可展开看 metadata
- 对象ID 可点击跳转
- 操作类型显示中文

## Task 6: 评测系统增强

增强 EvaluationPage：
- 创建数据集表单（Modal，输入名称+关联Schema）
- 导入样本（上传 JSON/CSV）
- 创建评测运行（选择数据集+Provider）
- 评测结果详情（字段级指标）

## 验证
1. pnpm typecheck 通过
2. medical-ui pnpm build 通过
3. 审计报告写入 /tmp/Medical-Record-Agent/PHASE3-AUDIT.md

【重要】不要问问题，直接开始工作。
