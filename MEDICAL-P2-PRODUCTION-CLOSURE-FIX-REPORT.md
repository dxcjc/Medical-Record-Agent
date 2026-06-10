# Medical P2 Production Closure Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 修复概述

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 推进 P2/生产化遗留闭环。已处理最新审计报告中的可工程化 remaining：

- demo-web build 不再出现 Vite 500 kB chunk warning。
- 保留单一 `vendor-arco`，不恢复 Arco 内部子 chunk，未引入 circular manual chunk warning。
- 补齐生产 secret resolver 与 queue contract 的 fail-fast 边界。
- 真实外部 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例持久化 broker 队列仍保持 blocked，不伪造通过。
- 增强移动端 reflow guard：页面头部 actions 横滚、inline actions 44px 触摸区、表格触摸横滚。

## 主要改动

- `apps/demo-web/vite.config.ts`
  - 新增 `@arco-design/web-react` exact alias，构建期指向 `apps/demo-web/src/vendor/arco-on-demand.ts`。
  - 保留单一 `vendor-arco` chunk。
  - 新增稳定 `vendor-react`、`vendor-app-runtime` chunk，避免非 Arco runtime 聚合超过 500 kB。
  - 未设置 `chunkSizeWarningLimit`。

- `apps/demo-web/src/vendor/arco-on-demand.ts`
  - 只 re-export 当前页面实际使用的 Arco 组件深入口。

- `apps/demo-web/src/pages/misc/NotFoundPage.tsx`
  - 移除 Arco `Result`，避免带入 403/404/500 预设插画模块。

- `apps/demo-web/src/pages/auth/LoginPage.tsx`
- `apps/demo-web/src/pages/recognition/components/RecognitionShared.tsx`
  - 移除少量 `Typography` 依赖，用既有文字样式承接视觉。

- `apps/demo-web/src/styles.css`
  - 补 NotFound 样式、移动端 action 横滚、inline action 44px 触摸区、table touch scrolling guard。

- `apps/api/src/bootstrap/production-services.ts`
  - 新增 `ProductionQueueContract`、`buildProductionQueueContract()`、`assertProductionQueueContract()`。
  - `QUEUE_MODE=in-process` 明确 `productionReady=false`。
  - `QUEUE_MODE=broker` 缺 broker URL、queue name、visibility timeout、retry limit、dead-letter queue 时 fail-fast。

- `scripts/production-smoke.ts`
  - 真实 sandbox 缺凭据时输出 `external credential blocked`。

- `.env.example`
  - 增加可靠队列 contract 占位配置，不修改真实 `.env`。

- `docs/2026-06-09-p2-production-handoff.md`
  - 更新 chunk 结论和 queue/secret/sandbox blocked 边界。

## 新增/更新测试

- `apps/demo-web/src/viteChunking.test.ts`
  - 守护 Arco 按需入口、禁止提高 `chunkSizeWarningLimit`、禁止恢复 Arco 子 chunk、真实 build 日志不得有 500 kB warning/circular warning。

- `apps/api/src/bootstrap/production-services.test.ts`
  - 覆盖 secret resolver invalid/missing ref。
  - 覆盖 in-process queue 非生产、多实例 broker 缺配置 fail-fast、broker contract 完整时通过配置检查。

- `scripts/production-smoke.test.ts`
  - 覆盖 `external credential blocked` 文案。

- `apps/demo-web/src/ui-arco-style-guards.test.ts`
  - 覆盖移动端 header actions 横滚、inline actions 44px、table touch scrolling。

- `docs/p2-production-handoff.test.ts`
  - 覆盖 chunk warning 已闭环、queue contract 和 blocked 边界文档。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；333 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB chunk warning，无 circular manual chunk warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`browserE2E=not-run`、6 条关键路由、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`，12 张截图写入 `ui-parity-screenshots/medical-e2e-current/`。
- 额外验证 `corepack pnpm smoke:production`：`MODE blocked`，`external credential blocked`，缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`。

## Build Chunk 结果

本轮 build 最大 JS chunk：

- `vendor-arco-_4u-J6Qa.js`：415.91 kB，gzip 111.19 kB。
- `vendor-react-CosDLm1s.js`：194.39 kB，gzip 60.78 kB。
- `vendor-app-runtime-CHfy19Dx.js`：120.07 kB，gzip 39.12 kB。
- `vendor-core-Cy0vAc9s.js`：104.88 kB，gzip 36.17 kB。

结论：原 `vendor-arco` >500 kB warning 已闭环，不靠提高 Vite warning limit，不恢复 Arco 子 chunk。

## 仍 Blocked 的外部条件

- 真实外部 OCR/LLM/LIMS sandbox：blocked，缺少真实 sandbox URL、账号、provider key、可写回 LIMS 测试环境和审批后的强脱敏样本。
- 真实 KMS/Vault/Secret Manager：blocked，当前只具备 env resolver contract 和 `secretRefs` 契约，不能声明真实 KMS 已接入。
- 多实例持久化可靠队列：blocked，当前新增 broker queue contract/fail-fast，但未接真实 Redis/RabbitMQ/SQS broker，未完成 lease/retry/dead-letter/worker heartbeat 多实例 smoke。
