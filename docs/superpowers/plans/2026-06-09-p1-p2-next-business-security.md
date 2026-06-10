# Medical P1/P2 Next Business Security Plan

> 本轮按用户要求执行 superpowers 流程：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。仓库根目录未发现 `CLAUDE.md`。

## Brainstorming

已读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、最新 `MEDICAL-P2-ASYNC-HANDOFF-AUDIT-REPORT.md`，并补读 P2 contract/readiness 报告。前序已完成 UI、chunk、部分 DTO、demo fallback、evaluation schema selection、external blocker readiness 等工作，本轮不重复伪造外部通过。

当前可继续本地落地的风险点：

- 生产写回 executor 仍兼容从裸 `input.fields` 生成 LIMS payload。HTTP 手工路由已丢弃客户端 fields/payload，但内部调用或未来 route 误接仍可能绕开 RecognitionResult/readyFields。
- `POST /writeback` 仍用手写 loose parser，缺少共享 DTO 和非法未知输入回归测试。
- production/readiness smoke 已能 blocked，但本轮报告必须继续明确缺真实 OCR/LLM/LIMS、KMS/Vault/Secret Manager、session store、broker 时不能写最终通过。

## Writing Plans

1. TDD：先补 production writeback executor 测试，证明 `confirmed=true` 手工写回不能使用客户端/裸 `fields`，必须从 `RecognitionResult.payload.writeback.readyFields` 读取；同时保留自动写回的服务端 workflow 输入能力。
2. TDD：先补 writeback route DTO 测试，要求未知 `fields/payload` 不透传，非法 `idempotencyKey` 或空 `jobId` 返回稳定错误，service 只收到 `{ jobId, confirmed, idempotencyKey?, actor }`。
3. 实现：引入 `writebackExecutionSource` 区分 `manual-confirmed` 与 `server-workflow`；手工 confirmed 路径只读 repositories，自动 workflow 路径只接受 core workflow 的 server context，不接受裸用户 payload。
4. 实现：把 writeback route parser 收敛到 `route-dtos.ts` 的 zod schema。
5. Verification-before-completion：运行用户指定 demo-web style/mobile/build、全量测试和当前可执行 readiness/smoke；真实外部凭据缺失时记录 blocked，不写 PASS。
6. 报告：生成 `MEDICAL-P1-P2-NEXT-BUSINESS-SECURITY-FIX-REPORT.md` 与 `MEDICAL-P1-P2-NEXT-BUSINESS-SECURITY-AUDIT-REPORT.md`，分层写清 UI/本地代码、本轮 P1/P2、真实外部集成、医疗最终产品结论。

## TDD Notes

- 红灯 1：`corepack pnpm vitest run apps/api/src/bootstrap/production-services.test.ts apps/api/src/routes/writeback.routes.test.ts`
  - `POST /writeback 拒绝非法 idempotencyKey` 预期 400，实际 200。
  - `POST /writeback 服务层返回非对象响应` 预期 500，实际 200。
- 红灯 2：`corepack pnpm --filter @medical-record-agent/api typecheck`
  - `route-service-contracts.test.ts` 中 writeback scalar response `@ts-expect-error` 未触发，说明 `WritebackRouteService` 仍可被 scalar 实现满足。
- 增强红灯：补充 production executor 测试，要求未标记 `source: "server-workflow"` 的裸 `fields` 被拒绝。
- 绿灯：实现后定向测试 `apps/api/src/bootstrap/production-services.test.ts apps/api/src/routes/writeback.routes.test.ts packages/core/test/jobOrchestrator.test.ts` 通过，API/core typecheck 通过。

## Verification

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `index-BI5ExnF3.js`，无 500 kB JS chunk warning。
- `corepack pnpm test`：通过，73 passed / 1 skipped files；425 passed / 1 skipped tests；存在既有 Node `DEP0040 punycode` warning。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:demo-web`：通过，mock-runtime 基础路由和 `/api/health` 检查通过。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`，engine `chrome-cdp`。
- `corepack pnpm smoke:production`：exit 2，预期 blocked；缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`，且 secret resolver/session store/queue broker 仍 blocked。
- `corepack pnpm readiness:external-blockers`：exit 2，预期 blocked；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm readiness:session-invalidation`：exit 2，预期 blocked；本地 adapter contract passed，真实两实例 session invalidation smoke 未跑。
- `corepack pnpm readiness:deployment`：exit 2，预期 blocked；本地 readiness passed，真实外部集成和最终产品 blocked。
