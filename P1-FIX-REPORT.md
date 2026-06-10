# P1 Fix Report

生成时间：2026-06-09 02:46:41 CST / Asia/Shanghai

## 流程记录

- 本轮按用户要求执行 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion`。
- 已先读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-ARCO-UI-AUDIT-REPORT.md`、`STYLE-FIX-REPORT.md`、`MEDICAL-UI-REFLOW-FIX-REPORT.md`、`P1-AUDIT-REPORT.md`、`P1-FIX-REPORT.md`，本轮基于现状继续，不重做 UI 补丁。
- 本轮未提交 git commit，未修改 `.env`、`node_modules`、缓存目录，未粗暴重写 CSS；保留 Material + Arco Design UI 边界。
- TDD 红灯/守护点：Schema 发布确认、生产写回可信边界、识别本地文件处理 AbortSignal、demo API job/result 闭环、集中 API normalizer 迁移。

## 本轮修复结论

### P1-3 Schema 发布危险操作门禁

修复文件：
- `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`
- `apps/demo-web/src/pages/schema/SchemaStudioPage.test.ts`

结论：发布、停用、回滚现在同级走 `ConfirmDialog` 二次确认。点击发布只执行 `setPendingDangerAction("publish")`，确认弹窗 `onConfirm={handlePublishDraft}` 后才调用 `api.publishSchemaDraft()`。

测试覆盖：
- `SchemaStudioPage.test.ts` 覆盖发布动作先进入 pending danger action，且源码守护 `onPublish={() => setPendingDangerAction("publish")}`、`open={pendingDangerAction === "publish"}`、`onConfirm={handlePublishDraft}`，并防止回退到 `onPublish={handlePublishDraft}`。

### P1-6 API 契约集中和页面 response shape 迁移

修复文件：
- `apps/demo-web/src/api/normalizers.ts`
- `apps/demo-web/src/api/types.ts`
- `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`
- `apps/demo-web/src/pages/operations/WritebackPage.tsx`
- `apps/demo-web/src/pages/operations/AgentTracePage.tsx`
- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx`

结论：Schema catalog/validation、Schema/Provider select options、Recognition detail、Writeback job/eligible item、Agent trace、Evaluation datasets/runs/metrics/run response 的后端 shape 兼容逻辑已迁移到集中 normalizer。页面不再维护 `response: unknown`、`job: unknown`、`result: unknown` 形态解析；`unknown` 保留在错误处理和必要 JSON/payload 边界。

静态审计：
- `rg -n "parse.*\\(.*unknown|job: unknown|result: unknown|response: unknown|mapApiSchema|summarizeSchemaStatuses|readStringField|readNumberField|readBooleanField|readArrayField" apps/demo-web/src/pages apps/demo-web/src/api`：无匹配输出。

### P1-6 生产写回可信边界

修复文件：
- `apps/api/src/bootstrap/production-services.ts`
- `apps/api/src/bootstrap/production-services.test.ts`

结论：`createProductionWritebackExecutor()` 在 `confirmed=true` 手动写回路径中强制重新读取服务端持久化 `RecognitionJob` 和 `RecognitionResult.payload.writeback.readyFields`，校验 job 状态、`reviewRequired`、readyFields 和阻塞写回 attempt 后，用服务端 readyFields 构造 LIMS payload。客户端传入的 `fields`/`payload` 不再影响手动 `/writeback` 生产写回内容。

测试覆盖：
- `production-services.test.ts` 传入伪造客户端 payload，断言 LIMS adapter 收到 `服务端持久化诊断`，并断言未收到 `客户端伪造诊断`。

### P1-8 长任务取消/重跑

修复文件：
- `apps/demo-web/src/utils/fileContent.ts`
- `apps/demo-web/src/utils/fileContent.test.ts`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`

结论：`blobToBase64()`、`blobSha256Hex()`、`buildRecognitionFileUploadInput()` 接收并传递 `AbortSignal`，在异步读取前后、digest 前后和 base64 循环中检查 abort 并抛 `AbortError`。识别创建取消后保留上一次提交配置，非 loading 状态允许重跑。

测试覆盖：
- 文件工具 abort 测试覆盖 base64 和 SHA-256。
- 识别页测试覆盖本地装配 AbortError 和取消后重跑状态。

### demo API 闭环与静态 fallback 门禁

修复文件：
- `apps/api/src/demo-services.ts`
- `apps/api/src/demo-services.test.ts`
- `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`（沿用显式 `VITE_DEMO_MODE=true` 才展示静态详情）
- `apps/demo-web/src/pages/operations/WritebackPage.tsx`（沿用显式 `VITE_DEMO_MODE=true` 才展示只读静态写回）

结论：默认 demo API 的 `jobService.create()` 现在运行 core mock OCR/LLM/validation 编排并按 jobId 保存 result；`resultService.getByJobId()` 不再对任意 jobId 返回固定假结果。前端详情页和写回页在非 demo mode API 失败时不展示静态假数据。

测试覆盖：
- `apps/api/src/demo-services.test.ts` 覆盖创建任务后按 jobId 返回 mock 编排结果，并覆盖不存在 jobId 返回 `null`。

### build chunk 维护

修复文件：
- `apps/demo-web/vite.config.ts`

结论：新增 Arco 子 chunk 拆分，最终 build 无 500k JS chunk 警告。仍存在 Rollup circular chunk 提示，未阻断构建，记录为 P2 打包优化项。

## 验证结果

用户指定命令：
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，11 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，1 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。最终入口 `dist/assets/index-DiLMJJKr.js`；最大 JS chunk `vendor-core-BWQWsrpC.js` 421.63 kB；无 500k JS chunk 警告。存在 Arco circular chunk 提示。
- `corepack pnpm test`：通过，62 passed、1 skipped；291 passed、1 skipped。仍有 Node `DEP0040 punycode` warning。

补充验证：
- `corepack pnpm --filter @medical-record-agent/demo-web typecheck`：通过。
- `corepack pnpm --filter @medical-record-agent/api typecheck`：通过。
- `corepack pnpm exec vitest run apps/api/src/demo-services.test.ts apps/api/src/bootstrap/production-services.test.ts`：通过，18 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web exec vitest run src/pages/schema/SchemaStudioPage.test.ts src/pages/evaluation/EvaluationPage.test.ts src/pages/recognition/NewRecognitionPage.test.ts src/pages/operations/WritebackPage.test.ts`：通过，25 tests passed。
- `corepack pnpm smoke:production`：失败，原因是 `PRODUCTION_SMOKE_BASE_URL 未配置，无法执行 production smoke。` 当前环境未配置真实外部集成地址，不能视为 production smoke 或外部集成验收通过。

9901 验证：
- `curl -i --max-time 10 http://localhost:9901/`：200 OK。
- `curl -i --max-time 10 http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 和 9901 返回 HTML 均引用 `/assets/index-DiLMJJKr.js`，确认 9901 读取最新 dist bundle。

## 仍未闭环项

- Evaluation production runner 仍固定 `limsClinicalInfoSchema`：`apps/api/src/bootstrap/production-services.ts` 的 `createProductionEvaluationRunner()` 未按 `runInput.schemaConfig.schemaKey/schemaVersion` 动态解析 active schema；本轮未完成。
- production smoke 外部集成未完成：缺少 `PRODUCTION_SMOKE_BASE_URL` 和真实/sandbox OCR、LLM、LIMS 环境变量，不能算外部集成验收通过。
- 生产异步任务队列未完成：`POST /jobs` 生产路径仍同步执行 OCR/LLM 编排；大文件或慢 provider 下仍有超时风险。
- 密钥库未完成：Provider `secretRefs` 已脱敏保存/返回，但运行时解密注入 KMS/Vault/Secret Manager 未产品化。
- 浏览器 E2E 未完成：已有 helper 和单元测试，但没有 Playwright/Cypress 真实浏览器上传、详情、反馈、写回、移动端截图验收。
- 安全基线仍需增强：JWT、CSP、rate limit、HttpOnly cookie/refresh token 轮换等未完整产品化。

## 结论

P1-AUDIT 打回项 P1-3、P1-6、P1-8 本轮阶段通过；`corepack pnpm test` 和 demo-web 指定样式/移动/build 验证通过。医疗项目未最终完成，PRODUCT-AUDIT 中的外部集成、Evaluation schema 解析、异步队列、密钥库和浏览器 E2E 仍需继续推进。

## 2026-06-09 产品级 7 维归档补齐

### 1. 产品概述

本报告原始范围是 P1 打回项修复。按当前工作区复核，Medical Record Agent 已从单纯 demo-web 修复推进到医疗病历识别工作台的 P1/P2 生产化准备：写回可信边界、Evaluation schema、异步任务 contract、secret/session/queue readiness、浏览器 E2E 和 handoff 均已有代码或文档推进。

但本报告不能作为医疗最终产品通过依据。最终验收仍取决于真实 OCR/LLM/LIMS sandbox、真实密钥库、生产多实例 session invalidation store、真实 broker 多实例可靠队列和真实 production smoke。

### 2. 功能完整性

当前已确认覆盖：

- Schema 发布、停用、回滚危险操作门禁。
- 集中 API 类型与 normalizer，页面不再维护主要 `unknown` response shape。
- `/writeback` 确认路径的服务端 readyFields 可信边界。
- 识别本地文件 base64/SHA-256 处理的 AbortSignal 和取消后重跑。
- demo API job/result 按 jobId 闭环。
- 详情页/写回页静态 fallback 只在 `VITE_DEMO_MODE=true` 启用。
- Evaluation production runner 按 `schemaKey/schemaVersionId` 解析 schema，已不是固定内置 LIMS schema。
- 异步任务队列 contract、Redis broker skeleton、secret resolver contract、session invalidation store contract。
- `smoke:production` 和 `readiness:deployment` 对真实外部条件 blocked 的分层输出。
- 浏览器 E2E 脚本与截图目录。

### 3. 业务流程完整性

本地/契约层业务流程已推进为：上传文件 -> 创建 job -> 可异步排队 -> worker/orchestrator 执行识别 -> 保存 result -> 详情查看 -> 反馈/Evaluation -> 服务端复核 readyFields -> 写回尝试 -> 审计/状态诊断。

需要特别修正旧剩余项：本报告早先写的 “Evaluation production runner 仍固定 `limsClinicalInfoSchema`” 和 “生产路径仍同步执行 OCR/LLM 编排” 已被后续代码覆盖。当前应表述为：Evaluation schema 解析代码已闭环；任务执行已有 asynchronous mode 和 queue contract，但真实 broker/worker 多实例可靠性仍 blocked。

### 4. 用户体验

P1 UX 已强化：危险发布动作二次确认，识别任务可取消/重跑，API 失败态不再被非 demo 静态数据掩盖，生产默认使用 HttpOnly cookie session 且不持久化 JWT，移动端和 UI 守卫通过。浏览器 E2E 可在 Playwright 或 Chrome CDP 可用时覆盖关键路由和移动抽屉。

仍需生产实测的 UX：真实慢 OCR/LLM Provider、真实 LIMS 写回失败/重试、真实队列积压、跨实例登出失效、真实密钥读取失败等场景。

### 5. 技术实现

当前技术证据：

- `apps/api/src/bootstrap/production-services.test.ts` 覆盖 production writeback 忽略客户端伪造 payload，使用服务端持久化诊断。
- `apps/api/src/demo-services.test.ts` 覆盖 demo API 创建 job 后按 jobId 返回 mock 编排结果，不存在 jobId 返回 `null`。
- `apps/api/src/bootstrap/production-services.test.ts` 覆盖 production evaluation runner 使用自定义 schema。
- `apps/api/src/services/api-services.test.ts` 覆盖 in-process queue contract 和 Redis broker skeleton lease/retry/dead-letter/heartbeat/幂等语义。
- `apps/api/src/server.test.ts` 覆盖安全响应头、HttpOnly cookie session、secret resolver/session store/queue status posture。
- `scripts/production-smoke.test.ts` 覆盖 production smoke blocked 分类。

### 6. 问题清单（P0/P1/P2）

P0：
- 未发现当前 build、全量测试、9901 首页或 `/api/health` 阻断级 P0。

P1：
- 已闭环：P1-3、P1-6、P1-8；demo API 闭环；非 demo 静态 fallback 禁用；Evaluation schema 解析。
- 仍 blocked：真实 external production smoke 未执行通过，真实 OCR/LLM/LIMS 不能写通过。

P2：
- 已推进：主业务 JS chunk 优化、浏览器 E2E 脚本、异步队列 contract、Redis broker skeleton、secret resolver contract、session invalidation store contract、deployment readiness gate、handoff。
- 仍 blocked：真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、多实例 broker/worker 可靠队列、真实 production smoke。
- 残余：`punycode` deprecation warning；数据库集成测试在当前环境 skipped。

### 7. 验收结论

本轮复验结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，18 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、13 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-DDGZMq2H.js`，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，67 passed、1 skipped；367 passed、1 skipped。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`，缺真实 sandbox、真实密钥库、生产多实例 session store、真实 broker。
- 9901 `/`：200 OK；9901 `/api/health`：200 OK；dist 与 9901 HTML 均引用 `/assets/index-DDGZMq2H.js`。

分层结论：UI 当前阶段通过；P1/P2 业务/安全/集成本轮推进部分通过；真实外部集成 blocked；医疗最终产品 blocked，不得在真实外部 sandbox、密钥库、多实例 session store 和真实 broker smoke 完成前写通过。
