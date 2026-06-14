# P3 Fixes Audit Report

**日期**: 2026-06-14  
**任务**: Phase 3 遗留问题修复

---

## 修复清单

### 1. ✅ 趋势图数据：替换静态数据为真实 API

**后端变更**:
- `apps/api/src/services/stats.service.ts` — 新增 `getTrendStats(schemaKey, days)` 方法
  - 使用 `Prisma.$queryRawUnsafe` 按天聚合 RecognitionResult 的 total/extracted/failed
  - 返回 `Array<{ date, total, extracted, failed }>`
- `apps/api/src/routes/stats.routes.ts` — 新增 `GET /api/stats/trend?schemaKey=xxx&days=30`
  - schemaKey 必填，days 可选（默认30，最大365）
  - 返回 `{ trend: TrendDataPoint[] }`

**前端变更**:
- `medical-ui/src/api/types.ts` — 新增 `TrendDataPoint` 接口
- `medical-ui/src/api/client.ts` — statsApi 新增 `getTrendStats()` 方法
- `medical-ui/src/hooks/useTrendStats.ts` — 新增 React Query hook
- `medical-ui/src/pages/AuditPage.tsx` — QualityReportTab 使用真实趋势数据
  - 替换原先的静态每周数据为 API 拉取的近30天数据
  - 添加 loading / 空数据 / 请选择 Schema 状态

**测试**:
- `apps/api/src/services/stats.service.test.ts` — 新增 3 个测试用例
  - 无数据时返回空数组
  - 正确聚合每日趋势数据
  - 正确传递参数到 $queryRawUnsafe

---

### 2. ✅ 反馈详情弹窗：浮窗改为 Modal

**变更文件**: `medical-ui/src/pages/FeedbackPage.tsx`

- 将右下角浮动 Card 替换为 Arco Design Modal
- Modal 内使用 Descriptions 组件展示结构化数据
- 展示内容：任务 ID、字段、原始值（红色背景）、修正值（绿色背景）、修正原因、提交时间、状态、审核时间
- 点击"关闭"按钮或遮罩层关闭 Modal

---

### 3. ✅ 评测运行指标：加固 MetricsDetailModal

**变更文件**: `medical-ui/src/pages/EvaluationPage.tsx`

- 添加 error 状态处理（`useQuery` 解构 error）
  - 错误时显示"指标数据加载失败"和具体错误信息
- 当 `metadata.breakdown` 为空时显示"暂无字段级指标"友好提示
  - 原逻辑在 fieldMetrics 为空时不渲染字段级指标卡片
  - 现在改为始终显示该卡片，空时显示友好提示
- 空 breakdown 的判断增强：`Object.keys(breakdown).length > 0`

---

### 4. ✅ 回写执行：增加错误处理和重试

**前端变更** (`medical-ui/src/pages/WritebackPage.tsx`):
- `WritebackConfirmModal` 增加 `isRetry` 属性
- `onError` 处理：从 `ApiError.body` 提取服务端具体错误信息，而非通用提示
- 历史表格新增"操作"列，对 `failed` 状态的记录显示"重试"按钮
- 重试时生成新的幂等键避免冲突

**后端变更** (`apps/api/src/services/api-services.ts`):
- `writebackService.execute` 增加 try/catch 包裹
  - 创建 attempt 失败时：记录日志，抛出 `WRITEBACK_CREATE_FAILED`
  - 完成 attempt 失败时：记录日志，尝试将 attempt 标记为 `failed`（retryable: true），抛出 `WRITEBACK_EXECUTION_FAILED`

---

### 5. ✅ 前端单元测试：补充 Vitest

**基础设施配置**:
- `medical-ui/package.json` — 新增 vitest、@testing-library/react、@testing-library/jest-dom、@testing-library/user-event、jsdom 依赖
- `medical-ui/vite.config.ts` — 添加 test 配置（jsdom、globals、setupFiles）
- `medical-ui/src/test/setup.ts` — jsdom polyfills（matchMedia、ResizeObserver、IntersectionObserver）
- `medical-ui/src/test/utils.tsx` — 测试工具函数（renderWithProviders）
- `medical-ui/package.json` — 新增 `test` 和 `test:watch` 脚本

**测试文件（15 个测试用例）**:

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `FeedbackPage.test.tsx` | 4 | 渲染、KPI 卡片、空状态、筛选控件 |
| `WritebackPage.test.tsx` | 3 | 渲染、Tab 导航、空状态 |
| `FieldCard.test.tsx` | 5 | 字段名/标签、类型、LIMS 路径、有/无统计 |
| `JobDetailPage.test.tsx` | 3 | 页面渲染、TraceView Tab 切换、节点渲染 |

---

## 验证结果

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `pnpm typecheck`（medical-ui） | ✅ 通过 | 无类型错误 |
| `pnpm build`（workspace） | ✅ 通过 | shared/core/api 构建成功 |
| `pnpm build`（medical-ui） | ✅ 通过 | tsc + vite build 成功 |
| 后端 stats 测试 | ✅ 7/7 通过 | 包含 3 个新增趋势测试 |
| 前端测试 | ✅ 15/15 通过 | 4 个测试文件全部通过 |
| 后端全量测试 | ⚠️ 334/349 通过 | 14 个失败均为预存问题，非本次变更引入 |

---

## 变更文件清单

### 后端（apps/api/）
- `src/services/stats.service.ts` — 新增 getTrendStats + TrendDataPoint 类型
- `src/routes/stats.routes.ts` — 新增 GET /api/stats/trend 路由
- `src/services/stats.service.test.ts` — 新增 3 个趋势测试 + $queryRawUnsafe mock
- `src/services/api-services.ts` — writebackService.execute 错误处理加固

### 前端（medical-ui/）
- `src/api/types.ts` — 新增 TrendDataPoint
- `src/api/client.ts` — statsApi.getTrendStats
- `src/hooks/useTrendStats.ts` — 新增 hook
- `src/pages/AuditPage.tsx` — 趋势图使用真实数据
- `src/pages/FeedbackPage.tsx` — 浮窗改为 Modal
- `src/pages/EvaluationPage.tsx` — MetricsDetailModal 加固
- `src/pages/WritebackPage.tsx` — 错误处理 + 重试按钮
- `vite.config.ts` — Vitest 配置
- `package.json` — 测试依赖和脚本
- `src/test/setup.ts` — jsdom polyfills
- `src/test/utils.tsx` — 测试工具
- `src/pages/FeedbackPage.test.tsx` — 新增
- `src/pages/WritebackPage.test.tsx` — 新增
- `src/components/FieldCard.test.tsx` — 新增
- `src/pages/JobDetailPage.test.tsx` — 新增
