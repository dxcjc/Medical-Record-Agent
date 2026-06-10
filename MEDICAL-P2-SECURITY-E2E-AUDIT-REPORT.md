# Medical P2 Security/E2E Audit Report

生成时间：2026-06-09 05:02:54 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品目标是将非结构化病历输入转为可追溯、可验证、可复核、可写回的结构化字段，并覆盖 Schema 管理、Provider 配置、OCR/LLM 编排、字段证据、人工反馈、Evaluation、LIMS 写回和审计。

本轮审计重点不是 UI 阶段验收，也不是上一轮 P1 验收，而是 P2 上线前安全、集成、E2E/smoke 和打包告警闭环。

## 2. 功能完整性

本轮已补齐：

- 新建识别任务前端适配 `asynchronous/queued/running/statusUrl/resultUrl`。
- 前端提供识别进度、轮询、terminal 后结果读取、失败错误提示。
- 本地 runtime smoke 覆盖登录页、首页 shell、关键路由、`/api/health`、生产 dist bundle。
- API 响应头安全基线、登录/写回 rate limit。
- Provider `secretRefs` 不泄漏、生产登录页不预填 demo 凭据的回归测试仍保持通过。
- Vite Arco manualChunks circular chunk 提示已通过单一 `vendor-arco` 策略消除。

仍未完整：

- 真实浏览器 E2E 未接入，本轮 smoke 明确是 `mock-runtime` 且 `browserE2E: not-run`。
- 真实外部 OCR/LLM/LIMS sandbox 未配置。
- 真实 KMS/Vault/Secret Manager 未接入。
- 任务队列仍是进程内最小闭环，不是持久化、多实例可靠队列。

## 3. 业务流程完整性

识别流程：

- 用户上传文件并创建任务。
- 前端接收 queued/asynchronous 任务响应，展示状态 URL 和结果 URL。
- queued/running 时轮询 `/jobs/:id`。
- completed/needs_review/partial_completed/writeback_* 等 terminal 状态后读取 `/results/:jobId`。
- failed/cancelled 时展示失败提示，不读取结果。

Smoke 流程：

- `corepack pnpm smoke:demo-web` 启动本地 Vite。
- 检查 `/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 检查 9901 `/api/health`。
- 检查 `apps/demo-web/dist/index.html` 引用生产 bundle。
- 输出 `mode: mock-runtime` 和 `browserE2E: not-run`，避免伪造真实浏览器验收。

安全流程：

- 所有 API 响应注入安全头。
- 登录接口默认 20/min 限流。
- 写回接口默认 30/min 限流，按来源和 actor 区分。
- 高风险写回仍要求认证、权限、`confirmed=true` 和服务端任务状态确认。

## 4. 用户体验

正向变化：

- 新建识别不再停留在“任务已创建”单点提示，而是有排队、运行、完成、失败的清晰状态。
- 用户能看到 Status URL 和 Result URL，terminal 后能读取结果并进入任务详情。
- 失败任务提供明确错误面板。
- 轮询中禁用重复重跑，降低重复创建后台任务风险。
- UI 修改是增量样式，保持当前 Material + Arco Design 企业级风格。

残余体验风险：

- 真实慢任务的取消、重试、队列积压可视化仍较弱。
- 浏览器级交互、截图、移动真实设备验收仍未完成。
- Arco vendor chunk 体积较大，弱网首屏性能仍需后续量化。

## 5. 技术实现

关键文件：

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
  - `describeRecognitionAsyncProgress()`。
  - `waitForRecognitionTerminalJob()`。
  - `loadRecognitionResultForTerminalJob()`。
  - 进度面板、状态 URL、结果 URL、结果读取和失败提示。
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`
  - queued/running/completed/failed 状态测试。
  - terminal 状态兼容测试。
  - 轮询中不可重跑测试。
- `apps/api/src/server.ts`
  - 安全响应头。
  - 默认登录/写回固定窗口 rate limit。
- `apps/api/src/server.test.ts`
  - 安全头、登录限流、默认限流、写回限流测试。
- `apps/api/src/routes/auth.routes.ts`
  - 登录限流 preHandler 注入点。
- `apps/api/src/routes/writeback.routes.ts`
  - 写回限流 preHandler 注入点。
- `scripts/demo-web-basic-e2e.ts`
  - 本地 runtime smoke。
  - API health 和 dist bundle 检查。
  - `browserE2E: not-run` 明确标记。
- `apps/demo-web/vite.config.ts`
  - Arco 单一 `vendor-arco` manual chunk。
- `apps/demo-web/src/viteChunking.test.ts`
  - 防止恢复 Arco 细拆导致 circular chunk warning。

验证结果：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，63 passed、1 skipped；312 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm smoke:demo-web`：通过，`mode: mock-runtime`、`browserE2E: not-run`。
- 9901 首页和 `/api/health`：通过。
- dist 与 9901 bundle 引用一致：`index-Bjxo6TmC.js`、`vendor-core-Bjp6EC4w.js`、`vendor-arco-Dt6qxrmd.js`、`vendor-interaction-5eOltMzJ.js`。

## 6. P0/P1/P2 问题清单

### P0

未发现当前阻断 typecheck、测试、demo-web build 或 9901 基础访问的 P0。

### P1

已闭环或保持通过：

- P1 异步任务后端最小闭环：上一轮已通过，本轮前端已适配。
- Provider `secretRefs` 不泄漏：回归测试保持通过。
- 生产登录页默认不预填 demo 凭据：回归测试保持通过。

Remaining：

- 真实 production sandbox 未配置，外部 OCR/LLM/LIMS 真实 smoke 仍不能声明通过。
- 进程内队列不满足多实例生产可靠队列要求。

### P2

本轮已闭环：

- P2-1 前端异步识别 UX：通过。
- P2-2 本地 runtime smoke：通过，但真实浏览器 E2E 未运行。
- P2-3 API 安全响应头、登录/写回 rate limit、secret/凭据回归：通过。
- P2-4 Arco manualChunks circular warning：通过，循环提示已消除。

仍需后续处理：

- 真实浏览器 E2E/截图验收。
- 真实 KMS/Vault/Secret Manager。
- 持久化队列、worker lease、重试、死信、监控、幂等消费。
- 真实 sandbox OCR/LLM/LIMS 和真实 production smoke。
- vendor-arco 超 500 kB 的体积优化。

## 7. 验收结论

本轮 P2 安全/E2E/集成阶段验收：通过。

依据：

- 所有指定验证命令均通过。
- 9901 首页和 `/api/health` 可访问。
- dist 与 9901 引用同一新 bundle。
- 异步 UX、runtime smoke、安全基线、chunk 优化均有代码和测试落地。
- Arco manualChunks circular warning 已消除。

医疗项目最终产品验收：不通过。

原因：

- 真实外部 sandbox 未配置，真实 OCR/LLM/LIMS production smoke 未完成。
- 任务队列仍为进程内最小闭环，未达到生产多实例可靠队列标准。
- 真实 KMS/Vault/Secret Manager 未接入。
- 真实浏览器 E2E 未运行，本轮仅为 `mock-runtime` smoke。
- vendor-arco 仍有 500 kB 体积提示，需要后续性能优化。
