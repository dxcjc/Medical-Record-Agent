# 2026-06-09 P2 Session Queue Hardening

## Brainstorming

- 指定审计与交接报告显示：UI 当前阶段、本地 readiness、mock-production contract、会话安全最小边界已通过。
- 仍 blocked 的关键生产项包括：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列、生产多实例 session invalidation store。
- 本轮可本地闭环的最高价值项：
  - 把 session invalidation 从进程内集合提升为可插拔 store contract，默认内存实现明确非多实例生产就绪，repository-backed store 只保存 token hash 并提供诊断姿态。
  - 把 `/status` 与 production smoke 的 blocked 分类扩展到 session invalidation store，避免多实例登出失效被误写成 production passed。
  - 强化 queue readiness 文案和 contract，明确 lease/retry/dead-letter/heartbeat/status consistency 均需真实 broker 多实例 smoke。
- 本轮不改 Prisma schema，不声明真实 Redis/RabbitMQ/SQS、真实数据库 session store、真实 KMS/Vault/Secret Manager 或真实 OCR/LLM/LIMS 已通过。

## Writing Plan

- [x] 读取指定 6 份报告与交接文档，确认当前 blocked 边界。
- [x] 先补测试：
  - auth service：默认 in-memory session invalidation store 非生产多实例，且只存 token hash。
  - repository-backed session invalidation store：通过 repository contract 失效 token、TTL 过期、诊断姿态脱敏。
  - server `/status`：返回脱敏 session invalidation store posture。
  - production services：构建 session invalidation store contract，配置缺失/adapter 未接/注入 repository 后 smoke 未跑三种状态。
  - production smoke：`/status` 暴露 session store 非生产时真实 smoke blocked；queue detail 包含 status consistency。
- [x] 实现：
  - `SessionInvalidationStore` 接口和 in-memory/repository-backed 实现。
  - auth service 注入 store，JWT 认证与 logout/login rotation 使用 store。
  - production session store contract 与 runtime status 诊断。
  - production smoke blocked 分类和 handoff 文档更新。
- [x] 验证：
  - 运行局部测试确认修复。
  - 运行用户指定完整命令。
  - 检查 9901 首页、`/api/health` 和 dist bundle。
- [x] 报告：
  - 生成 `MEDICAL-P2-SESSION-QUEUE-HARDENING-FIX-REPORT.md`。
- 生成 `MEDICAL-P2-SESSION-QUEUE-HARDENING-AUDIT-REPORT.md`，包含 7 个维度与分层结论。

## Verification Results

- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: passed, 67 passed / 1 skipped files, 364 passed / 1 skipped tests.
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`: passed, 15 tests.
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`: passed, 5 passed / 10 skipped.
- `corepack pnpm --filter @medical-record-agent/demo-web build`: passed, entry bundle `index-BkZEagFb.js`, max JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB.
- `corepack pnpm smoke:demo-web`: passed, `mode=mock-runtime`, `apiHealthOk=true`, `distBundleOk=true`.
- `corepack pnpm readiness:deployment`: exit code 2, required local gates passed, `localReadiness=passed`, `externalIntegration=blocked`, `finalProduct=blocked`.
- `corepack pnpm e2e:demo-web:browser`: standalone rerun passed after one non-required readiness run saw a transient Chrome/CDP route readiness failure.
- 9901 `/`: 200 OK.
- 9901 `/api/health`: 200 OK.
- `apps/demo-web/dist/index.html` and 9901 HTML reference `/assets/index-BkZEagFb.js`.

## TDD Notes

- 测试必须先覆盖新 contract，再实现代码。
- 真实外部凭据不可用时，`readiness:deployment` 允许 exit code 2；本地 readiness 不应失败。

## Verification Before Completion

Required commands:

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm smoke:demo-web`
- `corepack pnpm readiness:deployment`

Required local checks:

- 9901 `/` 可访问。
- 9901 `/api/health` 可访问。
- `apps/demo-web/dist/index.html` 引用真实新 bundle。

## Acceptance Boundary

- UI 当前阶段：保持通过，不改 Material + Arco CSS。
- P1/P2 本轮 session/queue hardening：本地 tests/readiness contract 通过才可写通过。
- 真实外部集成：无真实 sandbox/KMS/broker 前继续 blocked。
- 医疗最终产品：真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列和生产多实例 session invalidation store smoke 全部通过前继续 blocked。
