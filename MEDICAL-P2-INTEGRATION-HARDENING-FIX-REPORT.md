# Medical P2 Integration Hardening Fix Report

生成时间：2026-06-09 07:52:15 CST / Asia/Shanghai

## 流程记录

- Brainstorming：本地 P2 巡检失败点集中在 API typecheck；测试契约要求可插拔 SecretResolver 与 Redis broker queue skeleton，不允许把真实 KMS/Vault/Secret Manager 或 broker 伪装为 production ready。
- Writing plan：保留测试契约，修实现/导出/类型边界；完成后按 typecheck、test、demo-web build、demo smoke、production smoke 验证。
- TDD/测试优先：先执行 `corepack pnpm typecheck` 复现红灯，确认失败为 `createKmsSecretResolver`、`createSecretManagerResolver`、`createVaultSecretResolver`、`createRedisJobQueueAdapter`、`RedisJobQueueClient` 契约缺口。
- Verification before completion：所有本地验证命令已重新执行，结果见下方。

## 修复判断

这是实现/导出契约缺失，不是测试漂移。测试覆盖的目标符合 P1/P2：SecretResolver 可插拔边界、外部密钥服务 fail-fast blocked 语义、Queue adapter/broker/Redis contract 不被虚假声明为生产就绪。

## 修复文件

- `apps/api/src/bootstrap/production-services.ts`
  - 补齐并导出 `createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()` 的外部 resolver skeleton。
  - 支持注入测试/运行时 client；无 client 或契约不完整时只返回 `SECRET_RESOLVER_CONTRACT_INCOMPLETE` 或 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`。
  - 修复严格可选属性下 resolver client callback 的类型问题，避免可选 client 闭包返回 `undefined` promise。
  - 保持 contract 脱敏，不暴露 Vault token、KMS key material 或 Secret Manager credential。

- `apps/api/src/services/api-services.ts`
  - 补齐 Redis queue contract 的公开类型边界。
  - `createRedisJobQueueAdapter()` 返回 `RedisJobQueueAdapter`，让 `leaseNext()`、`complete()`、`fail()`、`heartbeat()`、`listDeadLetters()` 成为 broker skeleton 的明确 contract。
  - 保持 `describe().productionReady=false` 与 `blockedReason=QUEUE_BROKER_SMOKE_NOT_RUN`，避免把 mock client 验证误写成真实生产 broker 通过。

- `MEDICAL-P2-INTEGRATION-HARDENING-FIX-REPORT.md`
- `MEDICAL-P2-INTEGRATION-HARDENING-AUDIT-REPORT.md`
  - 按当前命令结果重新生成，删除与实际验证不一致的“通过”表述。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，Test Files `65 passed | 1 skipped (66)`；Tests `344 passed | 1 skipped (345)`。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm smoke:demo-web`：通过，`ok=true`、`mode=mock-runtime`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm smoke:production`：blocked，退出码 2；输出 `MODE blocked`、`STATUS blocked`。

## Blocked 条件

- `configuration`：缺少 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`，真实外部 API/OCR/LLM/LIMS smoke 未执行。
- `secret-resolver`：缺少真实 KMS/Vault/Secret Manager resolver 与凭据；当前 env resolver 不能代表生产密钥库。
- `queue-broker`：Redis adapter skeleton 可用，但缺少真实 Redis/RabbitMQ/SQS broker、worker 绑定、lease/retry/dead-letter/heartbeat 多实例 smoke。

## 结论

本地 P1/P2 集成加固闭环：通过。

真实外部生产闭环：不通过，状态为 blocked；必须提供真实 sandbox、真实密钥库、真实 broker 与多实例 smoke 后才能改判。
