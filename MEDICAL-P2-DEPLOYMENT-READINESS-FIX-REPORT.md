# Medical P2 Deployment Readiness Fix Report

生成时间：2026-06-09 09:12:41 CST / Asia/Shanghai

## 本轮目标

本轮不重复 UI patch，继续推进 P1/P2 业务/安全/集成生产化闭环中“不需要真实外部凭据也能补齐”的部署交接缺口。重点是让部署方接入真实环境前有可执行 gate、清晰 blocked/fail/passed 判定、脱敏依赖诊断和测试约束。

## 修复点

1. 新增 deployment readiness gate
   - 新增 `scripts/deployment-readiness-gate.ts`。
   - 新增 `package.json` 脚本：`corepack pnpm readiness:deployment`。
   - 汇总执行 typecheck、全量测试、demo-web style/mobile/build/smoke、browser E2E、真实 production smoke、mock-production smoke。
   - 输出 JSON 与文本摘要，分层给出：
     - `localReadiness`
     - `externalIntegration`
     - `finalProduct`
   - exit code 约定：
     - `0`：本地 readiness 和真实 production smoke 都通过。
     - `1`：本地或真实 smoke 有失败。
     - `2`：本地 readiness 可通过，但真实外部集成 blocked。

2. 强化 production smoke blocked 诊断
   - 更新 `scripts/production-smoke.ts`。
   - 缺真实 sandbox 配置时明确输出 `MODE blocked`、`STATUS blocked` 和具体缺失项。
   - blocked 文案包含 `SECRET_RESOLVER_ENV_ONLY`、`QUEUE_BROKER_NOT_CONFIGURED` 等部署方可搜索的 code。
   - 真实 sandbox 可访问时，会从 `/status` 读取脱敏 `secretResolver` 与 `queue` posture；若 `productionReady=false`，真实 smoke 仍标记 `blocked`，不伪造通过。

3. 暴露脱敏生产依赖 posture
   - 更新 `apps/api/src/server.ts`，允许 runtime info 返回 `secretResolver`。
   - 更新 `apps/api/src/index.ts`，生产模式 `/status` 返回 `buildSecretResolverContract(process.env)` 的脱敏 contract。
   - 新增 `apps/api/src/server.test.ts` 覆盖 `/status` 返回 secret resolver contract 且不泄露 token。

4. 更新交接文档与测试
   - 更新 `docs/2026-06-09-p2-production-handoff.md`，增加 readiness gate、exit code 和真实外部验收边界。
   - 更新 `docs/p2-production-handoff.test.ts`，锁住 `corepack pnpm readiness:deployment`、`exit code 2`、`localReadiness=passed`、`finalProduct=blocked` 等交接口径。
   - 新增 `docs/superpowers/plans/2026-06-09-p2-deployment-readiness.md`，记录 brainstorming、writing-plans、TDD 和 verification 流程。

## 测试优先覆盖

- 新增 `scripts/deployment-readiness-gate.test.ts`
  - 验证 command matrix。
  - 验证本地 readiness passed、真实 production blocked、最终产品 blocked 的分层汇总。
  - 验证浏览器 E2E blocked 不误伤本地 readiness。
  - 验证本地必需命令失败时 local readiness failed。

- 增强 `scripts/production-smoke.test.ts`
  - 验证 preflight blocked 文案包含部署 code。
  - 验证 `/status` 暴露 secret resolver 或 queue 非生产时，真实 smoke 分类为 blocked。

- 增强 `apps/api/src/server.test.ts`
  - 验证 `/status` 可返回脱敏 secret resolver contract。
  - 验证不泄露 `VAULT_TOKEN` 或占位 token。

## 验证命令结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm test` | 通过。Test Files `66 passed | 1 skipped (67)`；Tests `351 passed | 1 skipped (352)`。仍有既有 Node `DEP0040 punycode` deprecation warning。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过。15 passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过。5 passed、10 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过。最大 JS chunk `vendor-arco` 约 415.91 kB，无 500 kB JS chunk warning。 |
| `corepack pnpm smoke:demo-web` | 通过。`mode=mock-runtime`、`browserE2E=not-run`、`apiHealthOk=true`、`distBundleOk=true`。 |
| `corepack pnpm e2e:demo-web:browser` | 通过。`browserE2E=passed`、`engine=chrome-cdp`，覆盖 6 条路由的桌面/移动截图。 |
| `corepack pnpm smoke:production` | blocked，exit code 2。缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`，并明确 `SECRET_RESOLVER_ENV_ONLY`、`QUEUE_BROKER_NOT_CONFIGURED`。 |
| `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production` | 通过。`STATUS passed`，仅代表本地 mock-production contract smoke。 |
| `corepack pnpm readiness:deployment` | blocked，exit code 2。摘要为 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。 |

## 仍 blocked 的外部条件

- 真实 OCR/LLM/LIMS sandbox：缺真实 base URL、账号、密码、provider key、LIMS sandbox 和脱敏样本 smoke。
- 真实 KMS/Vault/Secret Manager：当前只有 contract/skeleton 和 env resolver；未接真实 SDK/client/凭据。
- 真实 broker 多实例可靠队列：当前 Redis adapter skeleton 与 in-process contract 可测；未完成真实 Redis/RabbitMQ/SQS、worker 绑定、lease/retry/dead-letter/heartbeat 多实例 smoke。
- 真实 production smoke：当前为 blocked，不是 passed。

## 结论

- UI 当前阶段：通过，本轮未修改 UI/CSS。
- P1/P2 deployment readiness 阶段：通过，新增 gate、诊断、文档和测试均已闭环。
- 真实外部集成：blocked。
- 医疗项目最终产品：不通过，除非真实外部条件全部接入并通过真实 production smoke。
