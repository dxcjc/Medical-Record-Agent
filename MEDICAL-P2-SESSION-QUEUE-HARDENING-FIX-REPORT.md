# Medical P2 Session Queue Hardening Fix Report

生成时间：2026-06-09 10:56:51 CST / Asia/Shanghai

## 本轮目标

继续推进 P1/P2 后续闭环，不停留在 UI 阶段。本轮聚焦不依赖真实外部凭据的两项本地产品化边界：

- 生产多实例 session invalidation store：从进程内失效集合推进到可插拔 store/repository contract、状态诊断和 smoke blocked gate。
- 真实 broker 多实例可靠队列 readiness：补强 deployment/smoke 诊断口径，明确 lease/retry/dead-letter/heartbeat/status consistency 均需真实 broker 多实例 smoke。

本轮不声明真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager、真实 Redis/RabbitMQ/SQS 或真实生产多实例 session store 已通过。

## Superpowers 流程

- Brainstorming：读取指定 6 份报告后确认 UI、本地 readiness、mock-production 和会话安全最小边界已通过；remaining blocked 在真实外部 sandbox、真实密钥库、真实 broker 和生产多实例 session store。
- Writing plan：已写入 `docs/superpowers/plans/2026-06-09-p2-session-queue-hardening.md`。
- TDD/测试优先：先新增 auth service、server status、production services、production smoke 和 readiness gate 测试，观察红灯后实现。
- Verification before completion：按用户指定命令完成验证；`readiness:deployment` 按预期 exit code 2，`localReadiness=passed`，真实外部集成 blocked。

## 修复点

- `apps/api/src/auth/auth.service.ts`
  - 新增 `SessionInvalidationStore` contract。
  - 新增 `createInMemorySessionInvalidationStore()`：本地单实例可用，只保存 token hash，支持 TTL，明确 `SESSION_INVALIDATION_STORE_IN_MEMORY`。
  - 新增 `createRepositorySessionInvalidationStore()`：通过 repository 写入 `tokenHash`、`invalidatedAt`、`expiresAt`，不持久化原始 JWT/cookie。
  - `authenticateJwt()`、login rotation、logout invalidation 均改走 store。

- `apps/api/src/bootstrap/production-services.ts`
  - 新增 `buildProductionSessionInvalidationStoreContract()`。
  - 新增 `createProductionSessionInvalidationStore()`。
  - 支持 `SESSION_INVALIDATION_STORE_MODE=repository`、`SESSION_INVALIDATION_STORE_PROVIDER=database|redis`、`SESSION_INVALIDATION_TTL_MS`。
  - 配置完整且注入 repository 后仍标记 `SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN`，不伪造生产多实例通过。

- `apps/api/src/server.ts`、`apps/api/src/index.ts`
  - `/status` 返回脱敏 `sessionInvalidationStore` posture。
  - production runtime 同时暴露 `secretResolver` 与 `sessionInvalidationStore` contract。

- `scripts/production-smoke.ts`、`scripts/deployment-readiness-gate.ts`
  - 真实 production smoke blocked 输出新增 `session-invalidation-store`。
  - queue blocked 文案补充 `status consistency`。
  - final product blocked reason 纳入生产多实例 session invalidation store。

- `docs/2026-06-09-p2-production-handoff.md`
  - 增加生产多实例会话失效交接要求。
  - 队列验收补充 job status/result consistency。

## 新增/更新测试

- `apps/api/src/auth/auth.service.test.ts`
  - repository-backed store 只持久化 token hash、TTL 过期后不再失效。
  - in-memory store 本地可用但明确非生产多实例就绪。

- `apps/api/src/server.test.ts`
  - `/status` 返回脱敏 `sessionInvalidationStore`，不泄露 JWT/cookie。

- `apps/api/src/bootstrap/production-services.test.ts`
  - session store 缺配置、配置完整但无 adapter、注入 repository 后 smoke 未跑三种姿态。

- `scripts/production-smoke.test.ts`
  - 真实 smoke 在 session store 非生产就绪时 blocked。
  - queue blocked detail 包含 status consistency。

- `scripts/deployment-readiness-gate.test.ts`
  - final product blocked reason 覆盖 session invalidation store。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，Test Files `67 passed | 1 skipped`；Tests `364 passed | 1 skipped`。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过；入口 bundle `index-BkZEagFb.js`，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm smoke:demo-web`：通过，`ok=true`、`mode=mock-runtime`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm readiness:deployment`：exit code 2；required local gates passed，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。真实 smoke blocked steps 包含 configuration、secret-resolver、session-invalidation-store、queue-broker。
- 额外确认：`corepack pnpm e2e:demo-web:browser` 单独通过，`browserE2E=passed`、`engine=chrome-cdp`。一次 readiness 重跑中 browser E2E 非 required gate 出现 Chrome/CDP 路由就绪瞬时失败，但不影响 local required readiness。

## 9901 / dist 检查

- `curl -i --max-time 10 http://localhost:9901/`：200 OK。
- `curl -i --max-time 10 http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 和 9901 首页均引用 `/assets/index-BkZEagFb.js`。
- 文件存在：
  - `apps/demo-web/dist/assets/index-BkZEagFb.js`
  - `apps/demo-web/dist/assets/vendor-arco-_4u-J6Qa.js`

## 剩余 Blocked 条件

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox URL、账号、provider key、LIMS 写回环境和脱敏样本 smoke。
- 真实 KMS/Vault/Secret Manager：blocked，当前不能声明真实密钥库读取通过。
- 生产多实例 session invalidation store：blocked，需真实数据库/Redis repository、至少 2 个 API 实例共享 store，并验证跨实例 logout/login rotation 后旧 cookie 返回 401。
- 真实 broker 多实例可靠队列：blocked，需真实 Redis/RabbitMQ/SQS、多 worker lease/retry/dead-letter/heartbeat/status consistency smoke。

## 分层结论

- UI 当前阶段：通过，本轮未改 Material + Arco CSS。
- P1/P2 本轮 session/queue hardening 阶段：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。
