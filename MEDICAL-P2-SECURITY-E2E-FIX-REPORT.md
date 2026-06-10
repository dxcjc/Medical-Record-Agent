# Medical P2 Security/E2E Fix Report

生成时间：2026-06-09 05:02:54 CST / Asia/Shanghai

## 范围与流程

本轮继续推进 P2/上线前安全、集成、E2E 验收闭环。按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。仓库根目录未发现 `CLAUDE.md`，本轮按仓库已有 superpowers 文档和用户指令执行。

本轮不提交 git commit，不回滚已有工作区改动。

## 修复点

### P2-1 前端异步识别任务 UX

涉及文件：

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`
- `apps/demo-web/src/styles.css`

已完成：

- 新建识别任务后读取后端 `asynchronous/queued/running/statusUrl/resultUrl` 语义。
- 增加 `describeRecognitionAsyncProgress()`、`isRecognitionPollingStatus()`、`isRecognitionSuccessfulTerminalStatus()`，兼容 `queued/running/completed/failed/needs_review/partial_completed/writeback_*` 状态。
- 创建任务后展示进度、状态 URL、结果 URL；`queued/running` 时轮询 `/jobs/:id`；terminal 后读取 `/results/:jobId`。
- 失败 terminal 状态展示错误提示，不再只提示“任务已创建”。
- 轮询中禁用重复重跑，避免重复创建后台任务。
- 测试覆盖 `queued/running/completed/failed`、terminal 状态和轮询中不可重跑。

### P2-2 demo-web runtime smoke

涉及文件：

- `scripts/demo-web-basic-e2e.ts`
- `scripts/demo-web-basic-e2e.test.ts`
- `apps/demo-web/src/App.test.ts`
- `package.json`

已完成：

- 增加可执行 `corepack pnpm smoke:demo-web`。
- smoke 启动本地 Vite，检查登录页、首页 shell、关键路由 `/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 检查 `http://127.0.0.1:9901/api/health`。
- 检查 `apps/demo-web/dist/index.html` 包含生产 bundle。
- 输出明确标记 `mode: mock-runtime`、`browserE2E: not-run`，不伪造真实浏览器 E2E。
- 修复 smoke dev server 进程组清理，成功后可正常退出。

### P2-3 安全基线增强

涉及文件：

- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/routes/auth.routes.ts`
- `apps/api/src/routes/writeback.routes.ts`

已完成：

- API 全局响应头增加 CSP、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Permissions-Policy`、`Cross-Origin-Resource-Policy`。
- 增加内存固定窗口 rate limit：
  - 登录默认 20/min，可测试/部署覆盖。
  - 写回默认 30/min，可测试/部署覆盖。
- 登录限流按来源 IP；写回限流按来源 IP + actor。
- 429 响应返回 `{ "error": "RATE_LIMITED" }`，并设置 `retry-after`。
- 保留并验证 `secretRefs`/底层 provider error 不泄漏，生产构建登录页默认不预填 demo 凭据。

说明：本轮没有声明真实 KMS/Vault/Secret Manager 已完成；真实 KMS 仍是外部部署项。

### P2-4 Vite manualChunks circular warning

涉及文件：

- `apps/demo-web/vite.config.ts`
- `apps/demo-web/src/viteChunking.test.ts`

已完成：

- 将 Arco 相关模块统一到 `vendor-arco`，不再把 Table/Form/Overlay/Input/_util 细拆成多个互相引用的 manual chunks。
- 新增测试防止恢复 `vendor-arco-table/vendor-arco-form/vendor-arco-overlay/vendor-arco-input/vendor-arco-runtime/vendor-arco-base` 细拆策略。
- 最终 build 未再出现 Arco manualChunks circular chunk 提示。

剩余：build 仍提示 `vendor-arco-Dt6qxrmd.js` 超过 500 kB。这是体积提示，不是 circular chunk 提示；后续可通过更细的业务懒加载、按需组件替换或 Arco 使用面收缩继续优化。

## 验证命令

全部已通过：

- `corepack pnpm typecheck`
- `corepack pnpm test`
  - 63 test files passed, 1 skipped
  - 312 tests passed, 1 skipped
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
  - 11 tests passed
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
  - 1 passed, 10 skipped
- `corepack pnpm --filter @medical-record-agent/demo-web build`
  - build passed
  - Arco circular manualChunks warning no longer appears
  - remaining warning: chunk size over 500 kB
- `corepack pnpm smoke:demo-web`
  - `ok: true`
  - `mode: mock-runtime`
  - `browserE2E: not-run`
  - checked routes: `/login`, `/`, `/recognition/new`, `/recognition/jobs/demo`, `/providers`, `/writeback`
  - `apiHealthOk: true`
  - `distBundleOk: true`

9901 验证：

- `http://localhost:9901/`：200 OK。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 返回 HTML 均引用：
  - `/assets/index-Bjxo6TmC.js`
  - `/assets/vendor-core-Bjp6EC4w.js`
  - `/assets/vendor-arco-Dt6qxrmd.js`
  - `/assets/vendor-interaction-5eOltMzJ.js`
- 9901 不是本轮启动的进程，本轮只做 HTTP 可访问性和 bundle 对齐验证。

代码搜索确认：

- 异步 UX：`describeRecognitionAsyncProgress`、`waitForRecognitionTerminalJob`、`statusUrl`、`resultUrl`、`async-recognition-*`。
- E2E/smoke：`classifyDemoWebRoute`、`isHealthyApiPayload`、`buildDemoWebSmokeSummary`、`browserE2E: "not-run"`、`smoke:demo-web`。
- 安全基线：`content-security-policy`、`x-content-type-options`、`createFixedWindowRateLimiter`、`RATE_LIMITED`、`rateLimit`。
- chunk 优化：`return "vendor-arco"`，且测试禁止恢复 Arco 细拆 chunk。

## 剩余问题

- 真实浏览器 Playwright/Cypress E2E 未接入；本轮为可执行 runtime smoke，明确标记 `browserE2E: not-run`。
- 真实外部 OCR/LLM/LIMS sandbox 未配置。
- 队列仍是进程内最小闭环，不是多实例持久化 worker/broker。
- 真实 KMS/Vault/Secret Manager 未接入。
- Arco vendor chunk 仍超过 500 kB，循环 chunk 提示已消除，但体积优化仍可继续。

## 阶段结论

本轮 P2 安全/E2E/集成阶段：通过。

医疗项目最终产品验收：不通过。真实外部 sandbox、持久化队列、真实 KMS/Secret Manager、真实浏览器 E2E 仍未闭环，不能声明最终产品通过。
