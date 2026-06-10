# Medical P1/P2 Continuation Round2 Fix Report

生成时间：2026-06-10 CST / Asia/Shanghai

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行。未提交 git commit，未修改 `.env`、`node_modules` 或无关缓存，未启动其他 agent，未把外部 blocked 写成 passed。

## 本轮实际推进

本轮审计前序 remaining/blocked 项后，确认写回 readyFields-only、Evaluation schema 解析、demo fallback、API response contract、provider health/secret redaction、queue broker skeleton 等已有本地测试守护。发现仍可本地推进的缺口是 session invalidation readiness 口径不一致：

- `readiness:external-blockers` 已要求 `login-rotation-cross-instance-smoke`。
- `smoke:production`、`readiness:session-invalidation`、`/status` session posture、生产 session contract 和 handoff 部分段落仍只列 `two-instance-session-invalidation-smoke`、`token-hash-ttl-verification`、`raw-token-not-persisted-check`。

本轮已将这些输出统一为四项 requiredChecks：

- `two-instance-session-invalidation-smoke`
- `token-hash-ttl-verification`
- `raw-token-not-persisted-check`
- `login-rotation-cross-instance-smoke`

## 修改文件

- `scripts/production-smoke.ts`：blocked configuration 和 `/status` dependency posture 中的 session requiredChecks 增加 `login-rotation-cross-instance-smoke`。
- `scripts/session-invalidation-readiness.ts`：本地 session readiness 输出同样增加登录轮换跨实例 smoke。
- `apps/api/src/auth/auth.service.ts`：in-memory/repository session invalidation store 的 `describe().readiness.requiredChecks` 对齐。
- `apps/api/src/auth/session-invalidation.repository.ts`：database/Redis adapter skeleton 的 readiness requiredChecks 对齐。
- `apps/api/src/bootstrap/production-services.ts`：production session invalidation store contract requiredChecks 对齐。
- `docs/2026-06-09-p2-production-handoff.md`：交接文档明确 production smoke 与 external blocker gate 都要求 `login-rotation-cross-instance-smoke`。
- 测试更新：`production-smoke.test.ts`、`session-invalidation-readiness.test.ts`、`auth.service.test.ts`、`session-invalidation.repository.test.ts`、`production-services.test.ts`、`docs/p2-production-handoff.test.ts`。
- 新增计划留痕：`docs/superpowers/plans/2026-06-10-p1-p2-continuation-round2.md`。

## TDD 红绿

红灯：

- `corepack pnpm vitest run scripts/production-smoke.test.ts scripts/session-invalidation-readiness.test.ts docs/p2-production-handoff.test.ts`：4 failed，缺 `login-rotation-cross-instance-smoke`。
- `corepack pnpm vitest run apps/api/src/auth/auth.service.test.ts apps/api/src/auth/session-invalidation.repository.test.ts apps/api/src/bootstrap/production-services.test.ts`：7 failed，`/status` 依赖的 auth/session readiness contract 缺同一检查项。

绿灯：

- `corepack pnpm vitest run apps/api/src/auth/auth.service.test.ts apps/api/src/auth/session-invalidation.repository.test.ts apps/api/src/bootstrap/production-services.test.ts scripts/production-smoke.test.ts scripts/session-invalidation-readiness.test.ts docs/p2-production-handoff.test.ts`：通过，70 passed。

## 必跑验证

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS chunk warning；本轮独立 build 输出入口曾为 `index-BI5ExnF3.js`，后续全量测试中的 chunking build 曾生成 `index-B_ik3DNq.js`，最终 deployment readiness build 后 dist 回到 `index-BI5ExnF3.js`。
- `corepack pnpm test`：通过，73 passed / 1 skipped files；425 passed / 1 skipped tests。存在既有 Node `DEP0040 punycode` warning。
- `corepack pnpm typecheck`：通过。

## Readiness / Smoke

- `corepack pnpm readiness:session-invalidation`：exit 2，预期 blocked；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`，requiredChecks 包含 `login-rotation-cross-instance-smoke`。
- `corepack pnpm readiness:external-blockers`：exit 2，预期 blocked；四类真实外部 blocker 仍 blocked。
- `corepack pnpm smoke:production`：exit 2，预期 blocked；缺真实 sandbox URL/账号/密码，且 secret resolver/session store/queue broker 仍 blocked；session requiredChecks 已包含 `login-rotation-cross-instance-smoke`。
- `corepack pnpm readiness:deployment`：exit 2，预期 blocked；本地 gates passed，external blocker readiness 和真实 production smoke blocked，mock-production contract smoke passed。

## 9901 验证

- `http://localhost:9901/`：200 OK。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 返回首页完全一致，`cmp` 结果为 0。
- 当前 dist 与 9901 首页均引用 `/assets/index-BI5ExnF3.js`，时间戳为 2026-06-10 00:43:44 +0800。

## 剩余 Blocked

- 真实 OCR/LLM/LIMS sandbox 未接入，真实 production smoke 不能通过。
- 真实 KMS/Vault/Secret Manager client/SDK 未接入，secret resolver 仍 blocked。
- 生产多实例 session invalidation store 未在至少两个 API 实例上完成登出和登录轮换跨实例 smoke。
- 真实 Redis/RabbitMQ/SQS broker 多 worker lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke 未通过。

结论：本轮本地业务/安全/交接合同已推进并验证通过；真实外部集成和医疗最终产品仍 blocked/不通过。
