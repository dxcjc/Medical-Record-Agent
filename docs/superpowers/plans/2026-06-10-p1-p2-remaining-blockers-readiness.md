# 2026-06-10 P1/P2 Remaining Blockers Readiness

## Brainstorming

- 不把 UI 阶段、mock-production 或本地 skeleton 当作医疗最终完成。
- 真实 OCR/LLM/LIMS sandbox、KMS/Vault/Secret Manager、多实例 session store 和真实 broker 都缺外部条件，只能保持 blocked。
- 本地可落地点：队列 readiness harness、deployment gate 接入、production smoke 队列 requiredChecks 一致性、punycode warning 来源诊断、报告交接。
- 不改 UI CSS，不改 `.env`、`node_modules` 或缓存。

## Writing Plan

- [x] 读取 required reports 和现有 readiness/smoke/session/queue/secret 代码。
- [x] 先补红灯测试：`queue-broker-readiness.test.ts`、`punycode-deprecation-diagnostic.test.ts`、deployment gate queue check 期望。
- [x] 实现 queue broker readiness CLI，并接入 `package.json` 与 deployment gate。
- [x] 统一 queue required checks：`heartbeat-status-consistency-smoke`、`status-result-consistency-smoke`、`idempotency-key-deduplication-smoke`。
- [x] 定位 `DEP0040 punycode` 来源并用 diagnostic 脚本记录 upstream dependency 边界。
- [x] 完成 required verification commands、9901 检查和最终报告。

## TDD / Tests First

- Red: 新测试先失败，原因是缺 `scripts/queue-broker-readiness.ts`、缺 `scripts/punycode-deprecation-diagnostic.ts`、deployment gate 未包含 queue readiness。
- Green: 实现脚本和 gate 后，定向测试通过。

## Verification Before Completion

已完成定向验证：

- `corepack pnpm exec vitest run scripts/queue-broker-readiness.test.ts scripts/punycode-deprecation-diagnostic.test.ts scripts/deployment-readiness-gate.test.ts apps/api/src/services/api-services.test.ts apps/api/src/bootstrap/production-services.test.ts --reporter=dot`
- `corepack pnpm readiness:queue-broker`：exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm exec tsx scripts/punycode-deprecation-diagnostic.ts`：exit code 0，`status=upstream-dependency`。
- `corepack pnpm readiness:external-blockers`：exit code 2，真实外部 blocker 明确 blocked。
- `corepack pnpm smoke:production`：exit code 2，configuration/secret/session/queue blocked。

最终补充验证：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm test`：通过。
- `corepack pnpm e2e:demo-web:browser`：通过。
- `corepack pnpm readiness:deployment`：exit code 2；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- 9901 `/` 与 `/api/health`：200 OK；dist 与 9901 HTML 均引用 `/assets/index-BI5ExnF3.js`。
