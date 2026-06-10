# 2026-06-09 P2 Integration Hardening Plan

## Brainstorming

- 不能把 UI 当前阶段通过当作医疗项目最终完成；本轮重点转向业务/安全/集成生产化边界。
- 真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实多实例 broker 缺外部条件，必须保持 blocked，不伪造通过。
- 可工程化落地点：把 env secret resolver 升级为可插拔工厂/contract；把 in-process queue 升级为 JobQueueAdapter contract；让 production smoke 明确 passed/blocked/failed；更新 handoff 和报告。

## Writing Plan

- [x] 读取延续说明、产品审计、生产闭环审计/修复报告、handoff 和已有 P1/P2/安全/E2E 报告。
- [x] 先补 contract 测试，覆盖 secret resolver 工厂、provider health 脱敏 blocked、queue adapter 能力声明、smoke blocked 分类、handoff 边界。
- [x] 实现 `SecretResolver` 工厂和外部 resolver fail-fast contract。
- [x] 实现 `JobQueueAdapter`/`JobQueue` 能力描述、in-process lease/retry/dead-letter/heartbeat 最小 contract、broker adapter blocked contract。
- [x] 更新 production smoke 和 handoff 文档。
- [ ] 运行 typecheck/test/styles/mobile/build，验证 9901 `/`、`/api/health` 和 dist bundle。
- [ ] 生成 fix report 与 audit report，分层写明 UI 当前阶段、本轮工程化阶段、真实外部集成、最终产品。

## TDD Notes

- Red tests first in `apps/api/src/bootstrap/production-services.test.ts`, `apps/api/src/services/api-services.test.ts`, `scripts/production-smoke.test.ts`, `docs/p2-production-handoff.test.ts`.
- Implementation must keep env resolver tests passing and must not introduce real Vault/KMS SDK dependencies.
- Queue broker configuration may become `configReady=true`, but `productionReady` remains false until a real broker adapter and smoke exist.

## Verification Before Completion

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- 9901 `/` and `/api/health`
- `apps/demo-web/dist/index.html` references the latest built bundle
