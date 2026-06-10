# Medical P1/P2 Next Business Security Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行。仓库根目录未发现 `CLAUDE.md`；已读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、最新 `MEDICAL-P2-ASYNC-HANDOFF-AUDIT-REPORT.md` 和相关 P2 readiness/contract 报告。本轮没有提交 git commit，没有伪造真实外部服务通过。

## 真实修复点

1. 写回可信边界继续收紧
   - `packages/core/src/engine/jobOrchestrator.ts`
   - `packages/core/src/engine/langgraphRecognitionWorkflow.ts`
   - `apps/api/src/bootstrap/production-services.ts`
   - `apps/api/src/bootstrap/production-services.test.ts`
   - `packages/core/test/jobOrchestrator.test.ts`

   变化：core 自动写回输入新增 `source: "server-workflow"`；生产 executor 对 `confirmed=true` 手工写回只从 `RecognitionResult.payload.writeback.readyFields` 读取 readyFields；未确认且未标记为 `server-workflow` 的裸 `fields` 输入返回 `WRITEBACK_REQUIRES_SERVER_WORKFLOW_SOURCE`，不再能直接生成 LIMS payload。

2. Writeback route DTO 和 response contract 收敛
   - `apps/api/src/routes/route-dtos.ts`
   - `apps/api/src/routes/writeback.routes.ts`
   - `apps/api/src/routes/writeback.routes.test.ts`
   - `apps/api/src/routes/route-service-contracts.test.ts`
   - `apps/api/src/services/api-services.ts`

   变化：`POST /writeback` 使用 `confirmedWritebackRouteInputSchema`，只允许 `jobId`、`confirmed: true`、可选非空 `idempotencyKey`。`fields/payload` 继续被剥离，非法 `idempotencyKey` 返回 400。`WritebackRouteService` 返回类型收紧为 route object/list，并用 response guard 阻止 scalar service response 被包装成 200。

3. 本轮计划与验收留痕
   - `docs/superpowers/plans/2026-06-09-p1-p2-next-business-security.md`

   记录了 brainstorming、writing plan、TDD 红绿和新鲜 verification 结果。

## TDD 红绿

红灯：

- `corepack pnpm vitest run apps/api/src/bootstrap/production-services.test.ts apps/api/src/routes/writeback.routes.test.ts`
  - 非法 `idempotencyKey` 预期 400，实际 200。
  - writeback service scalar response 预期 500，实际 200。
- `corepack pnpm --filter @medical-record-agent/api typecheck`
  - writeback route service scalar fixture 未被类型系统拒绝。

绿灯：

- `corepack pnpm vitest run apps/api/src/bootstrap/production-services.test.ts apps/api/src/routes/writeback.routes.test.ts packages/core/test/jobOrchestrator.test.ts`：通过，53 passed。
- `corepack pnpm --filter @medical-record-agent/api typecheck`：通过。
- `corepack pnpm --filter @medical-record-agent/core typecheck`：通过。

## 必跑验证结果

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `index-BI5ExnF3.js`，无 500 kB JS chunk warning。
- `corepack pnpm test`：通过，73 passed / 1 skipped files；425 passed / 1 skipped tests；存在既有 Node `DEP0040 punycode` warning。

## 额外 readiness/smoke

- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:demo-web`：通过。
- `corepack pnpm e2e:demo-web:browser`：通过，Chrome CDP，桌面/移动 12 张截图生成到 `ui-parity-screenshots/medical-e2e-current`。
- `corepack pnpm smoke:production`：exit 2，预期 blocked。缺真实 sandbox base URL、账号、密码；secret resolver、session store、queue broker 也明确 blocked。
- `corepack pnpm readiness:external-blockers`：exit 2，预期 blocked；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm readiness:session-invalidation`：exit 2，预期 blocked；本地 adapter contract passed，真实两实例 smoke 未跑。
- `corepack pnpm readiness:deployment`：exit 2，预期 blocked；本地 readiness passed，真实外部集成和最终产品 blocked。

## 剩余外部阻塞

- 真实 OCR/LLM/LIMS sandbox 未配置、未通过真实 production smoke。
- 真实 KMS/Vault/Secret Manager 未接真实 client/SDK，当前 env resolver 不能代表生产密钥管理。
- 生产多实例 session invalidation store 未通过两实例登出/轮换 smoke。
- 真实 Redis/RabbitMQ/SQS broker 多 worker lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke 未通过。

结论：本轮可本地落地的业务/安全 P1/P2 修复通过；真实外部集成和医疗最终产品仍 blocked/不通过。
