# 医疗 demo-web UI 全局返工报告

## 修复范围

本次按 `brainstorming -> writing-plans -> TDD/验证优先 -> verification-before-completion` 流程执行。当前医疗项目根目录未发现 `CLAUDE.md`，已读取 `/tmp/arrow-dealer-system/CLAUDE.md` 中 superpowers 约束，并以 `/tmp/arrow-dealer-system/src/styles.css` 及其拆分样式中的 Material + Arco 中台风格作为参考。

代码修复覆盖：

- `apps/demo-web/src/styles.css`
- `apps/demo-web/src/layouts/AppShell.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/pages/operations/components/OperationsPrimitives.tsx`
- `apps/demo-web/src/pages/misc/DatasetSpecPage.tsx`
- `apps/demo-web/src/pages/misc/NotFoundPage.tsx`
- `apps/demo-web/src/ui-arco-style-guards.test.ts`

## 用户指出问题逐条对应修复

1. 顶部导航条高度和侧边栏 logo 区域高度不一致  
   已统一 `--header-height: 64px`，`.brand-lockup` 与 `.topbar` 均设置 `height/min-height/max-height: var(--header-height)`，侧栏 brand 区、topbar、主内容起点视觉对齐。

2. 模块间距乱，整体不顺滑  
   新增 `--page-max-width`、`--section-gap`、`--card-padding`、`--form-gap` 等页面节奏 token，并统一 `.app-page`、`.panel`、`.metric-grid`、`.form-grid`、`.dashboard-grid`、`.operations-split`、`.provider-grid` 的 gap 与 padding。

3. 上传文件/PDF 区域和下面表单紧贴  
   `NewRecognitionPage` 从一个大卡片拆为 `recognition-upload-card`、`recognition-config-card`、`recognition-privacy-card`、`recognition-actions-card` 四个同级 section，表单整体使用 24px gap，卡片内部使用 20px gap。

4. 顶部导航在平板宽度文字换行  
   增加 `@media (min-width: 769px) and (max-width: 1180px)`，对 `.topbar-main`、`.topbar-title-stack`、`.breadcrumbs` 使用 `white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`、`min-width: 0`。

5. 内容宽度不足时应隐藏次要信息  
   在平板断点隐藏 `.topbar-search`、`.topbar-meta`、`.topbar-provider-status`、`.topbar-product-tag`、`.topbar-user-avatar`；保留面包屑、通知和引导核心入口。`StepGuide` 新增 `.topbar-guide` 外层，平板下收缩为 36px 图标按钮。

6. 整体完成度低于箭牌中台项目  
   补齐 DM Sans + Noto Sans SC 字体、蓝色 `#3370FF`、灰背景 `#F7F8FA`、白侧栏、active pill 高亮、左侧指示条、shadow-1/hover shadow-2、表格表头 `#FAFBFC`、行 hover `#F7F8FA`、按钮和卡片 transition、Arco 卡片 header/body 细节。

## 逐页巡检结果

- LoginPage：保留 Arco 登录页与医疗业务 preview，现由全局卡片、字体、按钮和移动端规则统一接管。
- RecognitionDashboardPage：运行状态、指标、最近任务、Provider 健康区域沿用统一 panel/metric/table 节奏。
- NewRecognitionPage：重点返工，上传、配置、隐私、操作区拆分，上传区与表单不再贴合。
- JobDetailPage：详情、证据、Trace、反馈区域使用统一 panel、table、timeline、payload 样式兜底。
- SchemaStudioPage：Schema 列表、版本、草稿、流程、校验、危险操作区由统一 toolbar/card/table 规则收敛。
- EvaluationPage：数据集、样本导入、运行、指标、版本对比沿用统一 gap、metric-card 和 Alert 层级。
- ProviderSettingsPage：Provider API、配置表单、Health Check 使用新增 `.provider-grid` 和统一 header actions。
- WritebackPage：写回筛选、候选任务、payload、确认动作使用统一 Operations header 和 split grid。
- AuditLogPage：筛选、导出、审计表、详情 payload 使用统一 page-header actions 和 table hover。
- AgentTracePage：Trace 读取表单和搜索区进入统一 header actions，Timeline/耗时分布由全局样式兜底。
- FeedbackSamplesPage：样本列表、入集确认、上下文 payload 使用 Operations 统一布局。
- DatasetSpecPage：从轻量文档页补强为指标卡、治理提示、检查清单、JSON 示例的中台页面。
- NotFoundPage：从简易卡片补强为 Arco Result 页面，并提供返回识别看板和新建识别入口。

## 平板/窄屏处理说明

- 平板 `769px-1180px`：topbar 从三列收缩为主标题区 + 操作区；隐藏搜索、API 地址、Provider 状态、产品 tag、头像；引导按钮保留为图标。
- `max-width: 1024px`：侧栏切换为 Drawer，主内容单列，`dashboard-grid/detail-grid/operations-split/provider-grid` 单列。
- `max-width: 768px`：页面 padding、card padding 收紧；header、toolbar、section title 纵向堆叠；表单、指标、Provider grid 单列；触摸控件不小于 44px。
- `max-width: 480px`：topbar gap 和页面 padding 进一步压缩，面包屑和 label 限宽截断。

## 构建结果

- `pnpm --filter @medical-record-agent/demo-web test:styles`：通过，11 个 UI 守护测试全部通过。
- `pnpm --filter @medical-record-agent/demo-web build`：通过。Vite 仅提示 vendor chunk 超过 500kB，这是现有依赖体积提示，不影响构建产物。
- 源码确认：`styles.css` 已存在 `--header-height: 64px`、`--page-max-width`、`--section-gap`、`--card-padding`、tablet media query、topbar 隐藏 class、recognition 分层 class、table/card hover；`AppShell.tsx` 已存在 `topbar-meta`、`topbar-provider-status`、`topbar-product-tag`、`topbar-guide`、`topbar-user-avatar`。

## 7 维产品审计

### 1. 产品概述

医疗 demo-web 是病历 OCR、结构化抽取、Schema 管理、评测、Provider 运维、写回、审计和反馈沉淀的一体化演示工作台。当前 UI 已从单点页面修补提升为统一中台壳层和统一页面节奏。

### 2. 功能完整性

核心导航、识别、任务详情、Schema、Evaluation、Provider、Writeback、Audit、Trace、Feedback、Dataset Spec、404 均有页面承载。此次未改业务 API 行为，只统一视觉结构、响应式策略和交互控件稳定性。

### 3. 业务流程

主流程保持为：上传病历 -> 选择 Schema/Adapter/Provider/隐私策略 -> 创建识别 -> 查看任务详情与证据 -> 人工反馈/评测沉淀 -> 写回控制 -> 审计追踪。新上传页分层后，业务顺序更清楚。

### 4. 用户体验

桌面端具备白侧栏、pill active、统一 topbar、清晰 section gap、稳定卡片阴影和表格 hover。平板端不会因副信息挤压导致 topbar 换行，窄屏端改为单列和 Drawer。

### 5. 技术实现

采用现有 React + Arco Design + lucide 图标体系，没有删除 Arco/Material 设计系统。全局 CSS token 化页面宽度、间距、卡片 padding、表单 gap，并通过 Vitest 静态守护测试约束关键 UI 规则。

### 6. 问题清单

- P0：未发现阻塞验收的 P0 UI 问题；指定 build 通过。
- P1：仍缺少真实浏览器截图比对，建议后续补 Playwright 视口截图基线，覆盖 1440、1024、820、390 宽度。
- P2：Vite vendor chunk 超过 500kB，属于构建体积优化项；可后续做 manualChunks 或路由级 chunk 拆分。

### 7. 验收结论

本次已完成全局巡检和全局返工，不是只修用户举例的两处。医疗 demo-web 的 Shell 对齐、平板防换行、上传页分层、页面节奏、Material + Arco 中台细节和逐页覆盖均已落地，并通过 UI 守护测试与指定生产构建。

## 2026-06-09 产品级 7 维归档补齐

### 1. 产品概述

本报告原始范围是 demo-web UI 全局返工。归档补齐后，产品定位需扩展到医疗病历结构化识别、人工复核、Evaluation、Provider 运维、LIMS 写回和审计治理的完整工作台。UI 返工通过只代表前端当前阶段可用，不代表真实外部医疗集成或最终产品验收通过。

### 2. 功能完整性

UI 页面承载完整：登录、识别看板、新建识别、任务详情、Schema Studio、Evaluation、反馈样本、Provider 设置、写回控制、Agent Trace、审计日志、数据集规范和 404 页面均有 Material + Arco Design 页面。

本轮复验确认后续产品级 P1/P2 修复已覆盖：写回可信边界、demo API job/result 闭环、静态 fallback demo mode 门禁、Evaluation schema selection、API normalizer 集中化、production smoke blocked 分类、异步队列 contract、安全响应头/HttpOnly cookie 基线、secret resolver contract、浏览器 E2E 脚本、session/queue handoff。

### 3. 业务流程完整性

当前本地业务流程可以在 UI 与 mock/demo API 下形成阶段闭环：上传或选择合成病历 -> 创建识别任务 -> 查看字段/证据/trace -> 反馈或评测 -> 写回候选确认 -> 审计。后续代码已强化生产写回：手动确认写回不再信任客户端 payload，而是服务端重读 RecognitionResult `readyFields`。

仍需保持 blocked 的生产闭环：真实 OCR/LLM Provider、真实 LIMS sandbox、真实生产密钥库、生产多实例会话失效 store、真实 broker/worker 多实例队列 smoke。没有这些外部条件时，业务闭环只能写本地/契约推进，不能写最终医疗产品通过。

### 4. 用户体验

UI 体验仍保持本报告返工目标：顶部与侧栏高度一致、页面间距稳定、上传与表单分层、平板 topbar 防换行、移动端 Drawer/单列/44px 触摸区。后续全局 polish 进一步改善宽屏容器、表格信息层级、按钮 wrap、隐私选项和移动横滚。

非 demo mode 下详情页和写回页不会在 API 失败时注入静态演示数据；这对医疗产品 UX 很关键，因为失败态必须暴露给用户，不能被样例数据掩盖。

### 5. 技术实现

本轮只归档更新报告，未重写 CSS。当前实现证据：

- `apps/demo-web/src/ui-arco-style-guards.test.ts` 覆盖 Arco/Material token、移动断点和 44px 触摸区。
- `apps/demo-web/src/pages/recognition/JobDetailPage.tsx` 与 `apps/demo-web/src/pages/operations/WritebackPage.tsx` 使用 `VITE_DEMO_MODE=true` 作为静态演示数据门禁。
- `apps/api/src/demo-services.ts` demo job 创建后运行 mock orchestrator 并按 jobId 保存 result。
- `apps/api/src/bootstrap/production-services.ts` 生产 Evaluation runner 按 `schemaKey/schemaVersionId` 解析 schema。
- `scripts/production-smoke.ts` 与 `docs/2026-06-09-p2-production-handoff.md` 明确外部 sandbox、secret、session store、broker 的 blocked 条件。

### 6. 问题清单（P0/P1/P2）

P0：
- 未发现当前 UI 构建、样式守卫、移动守卫、9901 首页或 `/api/health` 阻断级问题。

P1：
- 已闭环：Schema 发布确认、写回 readyFields 可信边界、页面 API shape 集中化、识别本地文件 AbortSignal、demo API 不再对任意 jobId 返回固定假结果、非 demo 静态 fallback 禁用。
- 仍 blocked：真实 production smoke 未配置外部 sandbox，不能验证真实 OCR/LLM/LIMS。

P2：
- 已闭环：路由分包和 Arco 按需入口消除 500 kB JS warning；浏览器 E2E 脚本与截图目录已存在；session/queue/secret resolver contract 和 handoff 已补齐。
- 仍 blocked：真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列、真实外部 smoke。
- 残余：`punycode` deprecation warning；数据库集成测试按环境 skipped。

### 7. 验收结论

本轮复验结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，18 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、13 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-DDGZMq2H.js`，最大 JS chunk 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，67 passed、1 skipped；367 passed、1 skipped。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`，缺真实 sandbox、真实密钥库、生产多实例 session store 和真实 broker。
- 9901 `/` 与 `/api/health` 均 200 OK；dist 与 9901 HTML 均引用 `/assets/index-DDGZMq2H.js`。

分层结论：UI 当前阶段通过；P1/P2 业务/安全/集成本轮推进部分通过；真实外部集成 blocked；医疗最终产品不得写通过。
