# Medical P1/P2 Contract Readiness Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行。未提交 git commit，未修改 `.env`、`node_modules` 或无关缓存；未重写 demo-web CSS，未破坏 9901/API 代理。

## 修复点

- Route contract 收敛：
  - `apps/api/src/routes/route-dtos.ts` 新增 schema、provider、audit DTO，以及 `assertRouteResponseObject*` response guard。
  - `schemas.routes.ts` 对草稿创建/更新/校验、发布、版本 compare query 使用 Zod DTO；剥离客户端伪造 actor/status/createdById；service 返回 scalar 时不再包装成 200。
  - `providers.routes.ts` 对保存配置使用 DTO，`config/secretRefs` 必须为对象，`enabled/isDefault` 缺省兼容 false；继续脱敏 secretRefs；provider list/default/health/save scalar response 进入 500 guard。
  - `audit.routes.ts` 对 query 做 DTO 收敛，`take` 上限 100，未知 query 不透传；audit list scalar item 进入 500 guard。
- Production smoke/readiness 诊断：
  - `scripts/production-smoke.ts` 的 blocked step 增加 `nextAction`、`requiredChecks`，CLI 增加 `NEXT`、`REQUIRED_CHECKS` 和扩展后的 `SUMMARY_JSON`。
  - `scripts/deployment-readiness-gate.ts` 解析 production smoke `SUMMARY_JSON`，在 summary 中输出 `blockedDiagnostics`，文本摘要增加 `BLOCKED_DETAIL`。
  - `docs/2026-06-09-p2-production-handoff.md` 补充 `SUMMARY_JSON`、`nextAction`、`requiredChecks`、`BLOCKED_DETAIL` 的交接说明。

## 关键文件

- `apps/api/src/routes/route-dtos.ts`
- `apps/api/src/routes/schemas.routes.ts`
- `apps/api/src/routes/providers.routes.ts`
- `apps/api/src/routes/audit.routes.ts`
- `apps/api/src/routes/schemas.routes.test.ts`
- `apps/api/src/routes/providers.routes.test.ts`
- `apps/api/src/routes/audit.routes.test.ts`
- `scripts/production-smoke.ts`
- `scripts/deployment-readiness-gate.ts`
- `scripts/production-smoke.test.ts`
- `scripts/deployment-readiness-gate.test.ts`
- `docs/2026-06-09-p2-production-handoff.md`
- `docs/p2-production-handoff.test.ts`

## 测试

- 先红后绿：`corepack pnpm vitest run apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts`，实现前 5 个新增断言失败，最终 22 passed。
- 定向：`corepack pnpm vitest run apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts docs/p2-production-handoff.test.ts`：46 passed。
- `corepack pnpm --filter @medical-record-agent/api typecheck`：通过。
- `corepack pnpm exec tsc -p tsconfig.scripts.json --pretty false`：通过。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `index-9cuUF0bK.js`；最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm test`：67 passed、1 skipped files；387 passed、1 skipped tests；仍有既有 `DEP0040 punycode` warning。
- `corepack pnpm smoke:production`：exit code 2，`MODE blocked`、`STATUS blocked`；不是 passed，也不是 failed。

## Remaining Blocked

- `configuration`: 缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`。
- `secret-resolver`: `SECRET_RESOLVER_ENV_ONLY`，真实 KMS/Vault/Secret Manager 未验证。
- `session-invalidation-store`: `SESSION_INVALIDATION_STORE_IN_MEMORY`，生产多实例 session invalidation store 未验证。
- `queue-broker`: `QUEUE_BROKER_NOT_CONFIGURED`，真实 Redis/RabbitMQ/SQS broker 多实例 lease/retry/dead-letter/heartbeat/status consistency smoke 未验证。

## 分层结论

- UI 当前阶段：通过。
- P1/P2 本轮可落地项：通过，route contract 与 smoke/readiness blocked 诊断已收敛。
- 真实外部集成：blocked。
- 医疗最终产品：blocked，不得声明最终完成。
