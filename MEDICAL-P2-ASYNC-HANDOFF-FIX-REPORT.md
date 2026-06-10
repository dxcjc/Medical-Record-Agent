# Medical P2 Async Handoff Fix Report

生成时间：2026-06-09 23:21:13 CST / Asia/Shanghai

## 1. 本轮范围

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 推进，不依赖真实外部凭据或服务，聚焦 demo-web 关键异步/长任务 UX 的本地闭环：

- 新建识别任务：补队列积压、worker 处理中、建议重试和失败恢复提示。
- Evaluation run / 样本导入：补提交中、队列等待、处理中、取消、失败重试和最近 run 状态提示。
- 写回执行：补运行、取消、失败、成功的状态恢复文案，继续只提交 `jobId + confirmed=true`。
- Provider 保存 / Health Check：补取消、重试、失败恢复提示，并透传 `AbortSignal`。
- Schema validate/publish/compare/deactivate/rollback：补取消当前请求、重试上次操作和生产变更恢复提示，保留危险操作二次确认。

本轮没有修改交接文档；新增报告文件为：

- `MEDICAL-P2-ASYNC-HANDOFF-FIX-REPORT.md`
- `MEDICAL-P2-ASYNC-HANDOFF-AUDIT-REPORT.md`

## 2. TDD 记录

先新增红灯测试并确认失败：

- `NewRecognitionPage.test.ts`：队列积压、worker 心跳、失败恢复提示。
- `EvaluationPage.test.ts`：run/import mutation 状态和 run 队列状态。
- `WritebackPage.test.ts`：写回 running/cancelled/failed 恢复状态。
- `ProviderSettingsPage.test.ts`：Provider 保存/健康检查取消和重试提示。
- `SchemaStudioPage.test.ts`：Schema 异步操作恢复提示。

红灯结果符合预期：新增 helper 缺失或识别 progress 缺少队列字段。实现后定向测试通过：6 个测试文件、55 tests passed。

## 3. 修改文件

- `apps/demo-web/src/api/client.ts`
  - 为 Schema 变更、Provider 保存/健康检查、eligible writeback list 增加可选 `ApiRequestOptions.signal`。

- `apps/demo-web/src/api/client.test.ts`
  - 扩展长任务 API `AbortSignal` 透传测试。

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
  - `describeRecognitionAsyncProgress()` 读取 `statusSemantics` 中的 `queuePosition`、`queueDepth`、`retryAfterSeconds`、`workerId`、`attempt`、`heartbeatAgeSeconds`。
  - 新增 `getRecognitionAsyncRecoveryHint()`。
  - 进度卡展示队列、worker、重试和恢复提示。

- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx`
  - 新增 `describeEvaluationMutationState()`、`describeEvaluationRunQueueState()`。
  - 页面增加 Evaluation 异步任务恢复状态区。

- `apps/demo-web/src/pages/evaluation/components/EvaluationRunPanel.tsx`
- `apps/demo-web/src/pages/evaluation/components/evaluationData.ts`
  - 支持 `已失败` run 状态展示。

- `apps/demo-web/src/pages/operations/WritebackPage.tsx`
  - 新增 `describeWritebackExecutionState()`，运行/取消/失败/完成复用统一状态文案。

- `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx`
  - 新增 `describeProviderAsyncAction()`。
  - 保存和 Health Check 支持取消、重试上次操作、失败恢复提示。

- `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`
  - 新增 `describeSchemaActionRecovery()`。
  - Schema validate/publish/compare/deactivate/rollback 支持 AbortSignal、取消当前操作和重试上次操作。

- 对应测试文件同步更新。

## 4. 验证结果

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-BI5ExnF3.js`；最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：通过，73 passed、1 skipped；421 passed、1 skipped。仍有既有 Node `DEP0040 punycode` deprecation warning，非本轮引入。
- 补充：`corepack pnpm --filter @medical-record-agent/demo-web typecheck`：通过。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 首页均引用 `/assets/index-BI5ExnF3.js`。

## 5. 剩余 blocked

- 真实 OCR/LLM/LIMS sandbox：blocked。
- 真实 KMS/Vault/Secret Manager：blocked。
- 生产多实例 session store smoke：blocked。
- 真实 broker 多实例可靠队列：blocked。

本轮没有把上述外部依赖项改写为 passed，也没有运行真实 production smoke。

## 6. 分层结论

- UI 当前阶段：通过，本轮未破坏 Material + Arco Design 约束。
- P1-P2 本轮阶段：通过，异步任务 UX 和 handoff 本地可执行状态已补强。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实外部 sandbox、密钥库、多实例 session store 和真实 broker smoke 未完成前，不能写最终产品通过。
