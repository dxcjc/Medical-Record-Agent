# 2026-06-10 P1/P2 Continuation Round2

## Brainstorming

- 前序报告已经闭环 UI、chunk、writeback readyFields-only、Evaluation schema 选择、demo fallback、provider/secret/session/queue skeleton 和 external blocker readiness。
- 真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列仍缺外部环境，必须保持 blocked。
- 本轮可本地推进的缺口是 readiness requiredChecks 一致性：`readiness:external-blockers` 已要求 `login-rotation-cross-instance-smoke`，但 `smoke:production`、`readiness:session-invalidation`、`/status` session posture 和 handoff 的部分段落仍只列登出双实例、hash/TTL、raw-token 检查。

## Writing Plan

- 先写测试，让 session requiredChecks 必须包含 `login-rotation-cross-instance-smoke`。
- 修正 production smoke、session readiness、auth store description、repository adapter description、production session contract 和 handoff 文档。
- 回跑相关单测，再跑用户指定 demo-web style/mobile/build、全量测试、9901 与 readiness/smoke。
- 报告中只声明本地 contract/readiness 通过，不声明医疗最终产品通过。

## TDD

红灯：

- `corepack pnpm vitest run scripts/production-smoke.test.ts scripts/session-invalidation-readiness.test.ts docs/p2-production-handoff.test.ts`
  - production smoke blocked report/session step 少 `login-rotation-cross-instance-smoke`。
  - session invalidation readiness requiredChecks 少 `login-rotation-cross-instance-smoke`。
- `corepack pnpm vitest run apps/api/src/auth/auth.service.test.ts apps/api/src/auth/session-invalidation.repository.test.ts apps/api/src/bootstrap/production-services.test.ts`
  - `/status` 依赖的 auth/session readiness contract 少 `login-rotation-cross-instance-smoke`。

绿灯：

- `corepack pnpm vitest run apps/api/src/auth/auth.service.test.ts apps/api/src/auth/session-invalidation.repository.test.ts apps/api/src/bootstrap/production-services.test.ts scripts/production-smoke.test.ts scripts/session-invalidation-readiness.test.ts docs/p2-production-handoff.test.ts` 通过。

## Verification Before Completion

- 必跑命令执行结果记录在 `MEDICAL-P1-P2-CONTINUATION-ROUND2-FIX-REPORT.md`。
- `smoke:production`、`readiness:external-blockers`、`readiness:session-invalidation` 预期 exit 2 blocked；blocked 不写 passed。
