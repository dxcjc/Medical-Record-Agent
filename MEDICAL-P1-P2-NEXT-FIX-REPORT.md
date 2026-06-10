# Medical P1/P2 Next Fix Report

生成时间：2026-06-09 04:53:40 CST / Asia/Shanghai

## 执行流程

本轮按用户要求执行 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion`。

- Brainstorming：检查 `NewRecognitionPage.test.ts` 的测试意图和 `NewRecognitionPage.tsx` 的页面实现，确认测试要求保留异步识别任务的 queued/running/completed/failed 状态归一化、轮询判断和 terminal 状态判断。
- Writing plan：最小修复范围限定在识别进度 helper、API job 类型契约和报告更新，不重写 Material + Arco UI，不触碰 9901 部署/API 代理。
- TDD/测试优先：先运行 `corepack pnpm typecheck` 复现红灯，再按红灯修复。
- Verification before completion：所有结论只基于本轮新鲜命令输出。

未执行 git commit。未修改 `.env`、`node_modules` 或无关缓存。

## 本次构建回归

审计调度员报告的原始失败点是：

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts` 从 `./NewRecognitionPage` 导入 `describeRecognitionAsyncProgress`、`isRecognitionPollingStatus`、`isRecognitionSuccessfulTerminalStatus`。
- 构建链认为 `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx` 未导出这些成员。

本轮实际复现到的红灯已经推进到下一层 TypeScript 契约问题：

- `ApiRecognitionJob` 类型缺少后端异步识别返回的 `statusUrl`、`resultUrl`。
- `describeRecognitionAsyncProgress()` 在 `exactOptionalPropertyTypes` 下把 `statusUrl: undefined`、`resultUrl: undefined` 显式写进返回对象，导致 optional 字段类型不匹配。
- 页面进度区依赖 `StatusPill` 展示 queued/running/completed/failed 状态；当前文件已保留该 Material + Arco 风格组件引入。

## 修复内容

直接修改文件：

- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/api/types.ts`

修复点：

- 保留并导出异步识别进度 helper：
  - `describeRecognitionAsyncProgress()`
  - `isRecognitionPollingStatus()`
  - `isRecognitionSuccessfulTerminalStatus()`
- `describeRecognitionAsyncProgress()` 继续把识别任务归一化为：
  - `queued`：排队中，25%，继续轮询。
  - `running`：识别中，65%，继续轮询。
  - `completed`：结果可读取/结果已就绪，100%，停止轮询，可进入结果。
  - `failed`：识别失败，100%，停止轮询，展示错误。
- successful terminal 状态兼容后端扩展：
  - `completed`
  - `needs_review`
  - `partial_completed`
  - `writeback_completed`
  - `writeback_failed`
- failed terminal 状态保持：
  - `failed`
  - `cancelled`
- 在构造 `RecognitionAsyncProgress` 时只在 URL 有值时写入 `statusUrl/resultUrl`，适配 `exactOptionalPropertyTypes`。
- 在 `ApiRecognitionJob` 中补充 `statusUrl?: string`、`resultUrl?: string`，对齐 API service 已返回的异步轮询链接。

未删除测试，未通过跳过或弱化断言掩盖问题。

## 验证命令

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，63 passed、1 skipped；311 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过；Vite 仍提示部分 chunk 大于 500 kB，但构建成功。
- `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production`：通过，包含 status、login、providers、provider health、file upload、recognition job queued/running/completed、result read、writeback succeeded。

## 剩余问题

- 真实 production sandbox 外部 API/OCR/LLM/LIMS 未在本轮执行；本轮只完成 `mock-production` 写回 smoke。
- demo-web build 仍有 Vite 大 chunk 警告，属于后续打包优化，不阻塞本次构建。
- 当前工作树在本轮开始前已有大量未提交改动；本次未回滚或重写这些无关改动。
- 生产级队列、真实 KMS/Vault/Secret Manager、真实浏览器 E2E 和完整生产安全基线仍属于后续 P1/P2 闭环项。
