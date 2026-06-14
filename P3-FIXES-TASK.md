# Phase 3 遗留问题修复任务

项目路径: /tmp/Medical-Record-Agent

## 背景
Phase 3 审计发现 5 个遗留问题，需要全部修复。

## 任务清单

### 1. 趋势图数据：替换静态数据为真实 API
- 后端：在 stats.routes.ts 新增 `GET /api/stats/trend?schemaKey=xxx&days=30` 端点
  - 按天聚合 RecognitionResult 的 total/extracted/failed 数量
  - 返回 `Array<{ date, total, extracted, failed }>`
  - 用 Prisma `$queryRawUnsafe` 做 GROUP BY DATE
- 前端：AuditPage 的 QualityReportTab 中 CssTrendChart 从 API 拉取真实数据
  - 新增 useTrendStats hook
  - 趋势图渲染最近30天实际数据
- 测试：写 stats.service.test.ts 中追加 trend 查询测试

### 2. 反馈详情弹窗：浮窗改为 Modal
- FeedbackPage.tsx 中反馈详情从右下角浮窗改为 Arco Design Modal
- Modal 内容：原始值 vs 修正值对比、修正原因、时间、操作人
- 点击反馈行中的"查看详情"按钮打开 Modal

### 3. 评测运行指标：验证并加固 MetricsDetailModal
- 检查 EvaluationPage.tsx 中 MetricsDetailModal 的数据结构
- 如果 metadata.breakdown 为空，显示"暂无字段级指标"友好提示
- 添加 loading 和 error 状态处理

### 4. 回写执行：增加错误处理和重试
- WritebackPage.tsx 中回写操作增加：
  - try/catch 错误捕获
  - 失败时显示具体错误消息（非通用提示）
  - 失败的任务显示"重试"按钮
- 后端 writebackService 增加基本的错误日志

### 5. 前端单元测试：补充 Vitest
- 检查 medical-ui 是否已配置 Vitest，如果没有则配置
- 为以下新增组件/页面编写测试：
  - FeedbackPage：渲染测试、列表加载
  - WritebackPage：渲染测试、列表加载
  - TraceView：节点渲染
  - FieldCard：属性展示
- 至少确保页面能正常渲染（smoke test 级别）

## 验证标准
- `pnpm typecheck` 通过
- `cd medical-ui && pnpm build` 通过
- 后端测试全部通过（无新增失败）
- 如果配置了 Vitest，前端测试也通过
- 生成 P3-FIXES-AUDIT.md 审计报告
