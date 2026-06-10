# Medical P1/P2 Contract Hardening Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 推进。未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录，未接入假的 KMS/Vault/Secret Manager、broker、session store 或外部 sandbox。

## 修复点

### 1. Provider 响应深度脱敏

- 文件：`apps/api/src/routes/route-dtos.ts`
- 文件：`apps/api/src/routes/providers.routes.ts`
- 新增 `redactSensitiveRouteValue()`，在 HTTP response 出口统一处理敏感字段。
- `secretRefs` 仍返回 configured 状态，不返回真实 ref 值或 secret 值。
- `secretRef` 名称、provider key、resolver source 和 blocked reason 可以用于诊断。
- `config.apiKey`、`clientSecret`、`Authorization`、`x-api-token`、`password`、`secretDiagnostics.value` 和 Bearer 字符串会被脱敏。
- Provider list、set default、save config、health response 全部走同一 scrubber。

### 2. Audit 历史 metadata 响应兜底脱敏

- 文件：`apps/api/src/routes/audit.routes.ts`
- 审计 middleware 已只写安全 metadata；本轮进一步在 `GET /audit` 响应前兜底 scrub，防止历史记录或外部导入记录带出明文密钥。
- `actorApiTokenId` 作为审计标识可以返回；原始 `Authorization`、`x-api-token`、password、apiKey、clientSecret、Bearer token 不返回。

### 3. 生产交接可执行性补强

- 文件：`docs/2026-06-09-p2-production-handoff.md`
- 文件：`docs/p2-production-handoff.test.ts`
- 新增部署方必须执行的安全 smoke：
  - `provider-response-secret-redaction-smoke`
  - `provider-health-secret-redaction-smoke`
  - `audit-metadata-secret-redaction-smoke`
- 保持真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 队列 blocked 口径。

### 4. Superpowers 过程记录

- 文件：`docs/superpowers/plans/2026-06-09-p1-p2-contract-hardening.md`
- 记录 brainstorming、writing plan、TDD 红绿、verification-before-completion 和验收边界。

## 测试与验证

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts` | 先红后绿；最终 21 tests passed。 |
| `corepack pnpm vitest run docs/p2-production-handoff.test.ts` | 先红后绿；最终 5 tests passed。 |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts docs/p2-production-handoff.test.ts` | 81 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed / 14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，无 500 kB JS chunk warning；单独 build 输出入口 `index-B7lcWWvU.js`。 |
| `corepack pnpm test` | 通过，68 passed / 1 skipped files；402 passed / 1 skipped tests；只有既有 `DEP0040 punycode` warning。 |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm smoke:production` | exit code 2，预期 blocked；不是 passed。 |
| `curl -I --max-time 5 http://localhost:9901/` | 200 OK。 |
| `curl --max-time 5 http://localhost:9901/api/health` | 200 OK，`{"status":"ok","service":"medical-record-agent-api"}`。 |
| 检查 `apps/demo-web/dist/index.html` | 当前 dist 引用 `/assets/index-DQ-Z7-_K.js`，对应文件存在。 |

说明：全量 `corepack pnpm test` 中的 `apps/demo-web/src/viteChunking.test.ts` 会再次执行 demo-web build，因此当前 dist 入口哈希是全量测试最后一次构建生成的 `index-DQ-Z7-_K.js`。

## Production Smoke Blocked 明细

`corepack pnpm smoke:production` 当前输出 `MODE blocked`、`STATUS blocked` 和 `SUMMARY_JSON`：

- `configuration`: 缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`。
- `secret-resolver`: `SECRET_RESOLVER_ENV_ONLY`，真实 KMS/Vault/Secret Manager 未接入。
- `session-invalidation-store`: `SESSION_INVALIDATION_STORE_IN_MEMORY`，生产多实例 session invalidation store 未验证。
- `queue-broker`: `QUEUE_BROKER_NOT_CONFIGURED`，真实 Redis/RabbitMQ/SQS broker 与 worker 多实例 smoke 未验证。

## 仍 Blocked 的外部条件

- 真实 OCR/LLM/LIMS sandbox 凭据和真实 smoke。
- 真实 KMS/Vault/Secret Manager resolver client/SDK 与 provider health secretRef smoke。
- 生产多实例 session invalidation store：数据库/Redis adapter、两实例登出/轮换失效 smoke、token hash TTL 校验。
- 真实 broker 队列：Redis/RabbitMQ/SQS、worker lease/retry/dead-letter/heartbeat/status consistency、多实例 smoke。
- 医疗项目最终产品验收：以上真实外部集成和多实例生产可靠性完成前继续 blocked。

## 分层结论

- UI 当前阶段：通过。
- P1/P2 本轮 contract/security/handoff 阶段：通过。
- 真实外部集成：blocked。
- 医疗项目最终产品：blocked。
