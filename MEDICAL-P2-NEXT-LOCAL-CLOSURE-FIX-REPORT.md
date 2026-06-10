# Medical P2 Next Local Closure Fix Report

生成时间：2026-06-09 20:05:39 CST / Asia/Shanghai

## 本轮范围

本轮继续推进“不依赖真实外部凭据也能本地闭环”的 P1/P2 项，聚焦生产多实例 session invalidation store 的下一步本地可执行闭环。

本轮不声明真实多实例 session invalidation store 已通过；真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列仍 blocked。

## Superpowers 流程

- Brainstorming：读取指定 continuation/audit/fix/handoff 材料后，确认 UI 当前阶段和本地 readiness 可守住，最高价值本地项为 session invalidation store adapter/readiness 细化。
- Writing plans：已写入 `docs/superpowers/plans/2026-06-09-p2-next-local-session-store-closure.md`。
- TDD/测试优先：先新增 adapter contract、production factory 和本地 readiness 脚本测试，确认缺模块和 factory 未接 adapter 时失败，再实现。
- Verification before completion：按用户指定命令跑完验证；`readiness:deployment` 按预期 exit code 2，且 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。

## 修复点

- `apps/api/src/auth/session-invalidation.repository.ts`
  - 新增 database adapter skeleton：通过 Prisma-like delegate upsert/findFirst 写入和查询 `tokenHash`、`invalidatedAt`、`expiresAt`。
  - 新增 Redis adapter skeleton：通过注入 client 使用 key prefix + `PX` TTL 写入 token hash。
  - adapter diagnostics 明确 `productionReady=false`、`SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN`，并暴露 `rawTokenPersisted=false`、`tokenHashOnly=true`。

- `apps/api/src/bootstrap/production-services.ts`
  - `createProductionSessionInvalidationStore()` 支持注入 `databaseDelegate` 或 `redisClient` 生成 repository-backed store。
  - `SESSION_INVALIDATION_REDIS_KEY_PREFIX` 作为 Redis skeleton 可选配置进入 contract config。
  - 即使 adapter skeleton 已注入，store 仍保持 `SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN`，等待真实双实例 smoke。

- `scripts/session-invalidation-readiness.ts`
  - 新增本地验收脚本和 `corepack pnpm readiness:session-invalidation`。
  - 本地检查 database adapter、Redis adapter、production factory diagnostics。
  - 预期输出 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`，exit code 2。

- `scripts/production-smoke.ts`、`apps/api/src/auth/auth.service.ts`
  - session invalidation blocked requiredChecks 增加 `raw-token-not-persisted-check`，与本地 adapter/readiness 口径一致。

- `docs/2026-06-09-p2-production-handoff.md`
  - 补充 database/Redis adapter skeleton、本地 readiness 脚本和真实双实例 smoke 边界。

## 新增/更新测试

- `apps/api/src/auth/session-invalidation.repository.test.ts`
  - database adapter 只写 token hash 和 TTL 字段，不持久化 raw JWT/cookie。
  - Redis adapter 使用 TTL 写 hash，不把 raw JWT/cookie 发送到 Redis。

- `apps/api/src/bootstrap/production-services.test.ts`
  - production factory 可用 database delegate 创建 adapter skeleton。
  - production factory 可用 Redis client 创建 adapter skeleton。
  - 两者均保持真实多实例 smoke blocked。

- `scripts/session-invalidation-readiness.test.ts`
  - 本地 adapter contract checks 通过时，external/final 仍 blocked。
  - adapter 泄露 raw token 时本地 readiness failed。

- 已同步更新 `auth.service.test.ts`、`production-smoke.test.ts` 的 requiredChecks 断言。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，Test Files `72 passed | 1 skipped`；Tests `413 passed | 1 skipped`。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过；入口 bundle `index-RRIirKAv.js`，`vendor-arco-_4u-J6Qa.js` 415.91 kB。
- `corepack pnpm readiness:session-invalidation`：exit code 2，预期 blocked；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- `corepack pnpm readiness:deployment`：exit code 2，预期 blocked；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。真实 production smoke blocked steps 包含 configuration、secret-resolver、session-invalidation-store、queue-broker。

## 9901 / dist 检查

- `http://localhost:9901/`：200 OK。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 首页均引用 `/assets/index-RRIirKAv.js`。
- 已确认文件存在：
  - `apps/demo-web/dist/assets/index-RRIirKAv.js`，38,331 bytes。
  - `apps/demo-web/dist/assets/vendor-arco-_4u-J6Qa.js`，415,913 bytes。

## 剩余 Blocked

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox URL、账号、provider key、LIMS 写回环境和脱敏样本 smoke。
- 真实 KMS/Vault/Secret Manager：blocked，当前只具备 resolver contract/skeleton，未接真实密钥库。
- 生产多实例 session invalidation store：blocked，本轮只完成 database/Redis adapter skeleton、本地 contract 和诊断；仍需真实共享 store、至少 2 个 API 实例和跨实例 logout/login rotation smoke。
- 真实 broker 多实例可靠队列：blocked，需真实 Redis/RabbitMQ/SQS、多 worker lease/retry/dead-letter/heartbeat/status-result consistency smoke。

## 分层结论

- UI 当前阶段：通过。
- 本轮 P1/P2 本地产品化闭环：通过，session invalidation store adapter skeleton/readiness 本地闭环完成。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列全部通过前，不能写通过。
