# 2026-06-09 P2 生产化交接

本文用于把本轮本地可闭环项和真实外部 remaining/blocked 项分开，避免把 UI 阶段通过或本地 mock smoke 误判为医疗项目最终完成。

## 本轮本地已闭环

- 浏览器 E2E：`pnpm e2e:demo-web:browser` 会优先尝试 Playwright；当前仓库未安装 Playwright 时，脚本会使用系统 Chrome CDP 跑真实浏览器验收。如果 Playwright 和 Chrome 都不可用，输出 `browserE2E=blocked` 和原因。
- 截图目录：通过时保存到 `ui-parity-screenshots/medical-e2e-current/`。
- 覆盖路由：`/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 移动端断言：移动视口检查桌面侧栏隐藏、44px 导航按钮、抽屉导航可打开。
- 本地 runtime smoke：`pnpm smoke:demo-web` 仍只代表 mock-runtime 基础访问，不代表真实浏览器或真实外部集成。

真实浏览器 E2E 不等同于真实 OCR/LLM/LIMS sandbox 验收；它只证明前端关键路由和移动布局能在本地浏览器环境打开。

## 本轮验证补充

2026-06-09 本地验证结果：

- `corepack pnpm e2e:demo-web:browser`：通过，输出 `browserE2E=passed`、`engine=chrome-cdp`。
- 截图已生成 12 张，覆盖桌面和移动端 6 条关键路由。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过；本轮不再出现 Vite 500 kB chunk warning，也未出现 circular manual chunk warning。
- 当前策略：`@arco-design/web-react` 构建期 exact alias 到 `apps/demo-web/src/vendor/arco-on-demand.ts`，只导出当前页面使用的 Arco 组件深入口；`vendor-arco` 仍保持单一 chunk，不恢复 Arco 内部子 chunk 细拆，不提高 `chunkSizeWarningLimit`。
- 当前主要 JS chunk：`vendor-arco` 约 415.91 kB、`vendor-react` 约 194.39 kB、`vendor-app-runtime` 约 120.07 kB、`vendor-core` 约 104.88 kB。
- 2026-06-10 补充：`corepack pnpm readiness:queue-broker` 已补成本地队列 contract/readiness harness。该命令本地检查通过时仍预期 exit code 2，输出 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked` 和 `QUEUE_BROKER_SMOKE_NOT_RUN`，因为真实 Redis/RabbitMQ/SQS 多 worker smoke 未运行。
- 2026-06-10 补充：`corepack pnpm exec tsx scripts/punycode-deprecation-diagnostic.ts` 已定位当前 `DEP0040 punycode` warning 为 upstream dependency：`whatwg-url@5.0.0` 与 `tr46@0.0.3` 加载 Node builtin `punycode`。当前仓库 app/source 未直接导入 `punycode`，不得 patch `node_modules`，只能继续跟踪或升级上游依赖。

## CI 建议

基础 CI 可分两段。部署交接建议先跑聚合 gate，再按需查看单项日志：

```bash
corepack pnpm readiness:deployment
```

`corepack pnpm readiness:deployment` 会顺序执行 typecheck、全量测试、demo-web style/mobile/build/smoke、浏览器 E2E、真实 production smoke 和 mock-production contract smoke，并输出 JSON 与文本摘要。判定口径：

- `exit code 0`：`localReadiness=passed`、`externalIntegration=passed`、`finalProduct=passed`。只有真实外部 sandbox、真实密钥库、生产多实例 session invalidation store、真实 broker smoke 都满足时才可能出现。
- `exit code 1`：至少一个本地必需 gate 或真实 production smoke 失败，需要修复代码、配置或部署。
- `exit code 2`：本地必需 gate 可通过，但真实外部条件仍 blocked。此时可写 `localReadiness=passed`，但必须写 `finalProduct=blocked`，不能写医疗最终产品通过。

真实 production smoke 的 CLI 输出包含 `SUMMARY_JSON` 单行机器可读摘要；`readiness:deployment` 会解析该摘要并在文本摘要中输出 `BLOCKED_DETAIL`。blocked diagnostic 至少包含 `code`，可选包含 `missingKeys`、`provider`、`adapter`、`requiredExternal`、`nextAction` 和 `requiredChecks`。交接或 CI 报告应直接引用这些字段，不要把自然语言日志截断后写成 passed。

典型 blocked diagnostic：

- `PRODUCTION_SMOKE_CONFIGURATION_MISSING`：`nextAction` 指向配置 `PRODUCTION_SMOKE_MODE=real-sandbox`、真实 sandbox base URL 与账号；`requiredChecks` 包含 `real-external-api-login`、`real-provider-sandbox-connectivity-smoke`、`real-ocr-llm-lims-sandbox-smoke` 和 `writeback-readyFields-only-smoke`。
- `SECRET_RESOLVER_ENV_ONLY`：`nextAction` 指向配置 `SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager` 并接入真实 client/SDK；`requiredChecks` 包含 `external-secret-resolution-smoke`、`provider-health-secretRefs-smoke`、`provider-response-secret-redaction-smoke`、`provider-health-secret-redaction-smoke` 和 `audit-metadata-secret-redaction-smoke`。
- `SESSION_INVALIDATION_STORE_IN_MEMORY`：`requiredChecks` 包含 `two-instance-session-invalidation-smoke`、`token-hash-ttl-verification`、`raw-token-not-persisted-check` 和 `login-rotation-cross-instance-smoke`。
- `QUEUE_BROKER_NOT_CONFIGURED`：`requiredChecks` 包含 `multi-worker-lease-smoke`、`retry-dead-letter-smoke`、`heartbeat-status-consistency-smoke`、`status-result-consistency-smoke` 和 `idempotency-key-deduplication-smoke`。

部署方还必须把响应脱敏作为安全 smoke 的固定项：

- `provider-response-secret-redaction-smoke`：调用 `GET /providers`，确认 `secretRefs` 只显示 configured 状态，`config.apiKey`、`clientSecret`、`Authorization`、`x-api-token`、Bearer 字符串和任何明文 secret 不出现在响应体。
- `provider-health-secret-redaction-smoke`：调用 `POST /providers/:key/health`，确认 `secretDiagnostics.value`、健康探针 headers、错误 message/log 中不回显真实密钥；secretRef 名称可以返回，用于部署诊断。
- `audit-metadata-secret-redaction-smoke`：调用 `GET /audit`，确认历史 metadata 中的 `Authorization`、`x-api-token`、password、apiKey、clientSecret 和 Bearer 字符串被脱敏；`actorApiTokenId` 这类审计标识可以返回，但不得包含原始 token。

单项命令如下：

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @medical-record-agent/demo-web test:styles
corepack pnpm --filter @medical-record-agent/demo-web test:mobile
corepack pnpm --filter @medical-record-agent/demo-web build
corepack pnpm smoke:demo-web
corepack pnpm e2e:demo-web:browser
corepack pnpm readiness:external-blockers
corepack pnpm readiness:queue-broker
corepack pnpm exec tsx scripts/punycode-deprecation-diagnostic.ts
corepack pnpm smoke:production
PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production
```

浏览器环境要求：

- 推荐安装 Playwright 和浏览器，并允许脚本访问 headless Chromium。
- 当前本地 fallback 需要可执行的 `google-chrome`、`google-chrome-stable`、`chromium` 或 `chromium-browser`。
- 无浏览器时保留 `browserE2E=blocked`，CI 不应把 blocked 写成 passed。

## 外部 blocker readiness gate

`corepack pnpm readiness:external-blockers` 是外部交接诊断入口，用来把真实外部条件拆成四个 blocker，并按 `env/config/endpoints/credentials/smoke` 五层输出 gate。缺真实外部依赖时该命令预期 exit code 2，输出 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`；这不是失败，也不是最终产品通过。

典型输出行：

- `GATE real-ocr-llm-lims-sandbox env=...`：列出 `PRODUCTION_SMOKE_MODE=real-sandbox`、sandbox base URL、账号、schema key、识别/写回 smoke 开关等 env 是否齐备。
- `GATE external-secret-manager credentials=...`：列出 Vault/KMS/Secret Manager 服务账号、secretRef 读取权限、轮换测试 secretRef 是否齐备。
- `GATE production-session-store smoke=pending-smoke ...`：固定要求 `two-instance-session-invalidation-smoke`、`token-hash-ttl-verification`、`raw-token-not-persisted-check`、`login-rotation-cross-instance-smoke`。
- `GATE production-queue-broker smoke=pending-smoke ...`：固定要求 `multi-worker-lease-smoke`、`retry-dead-letter-smoke`、`heartbeat-status-consistency-smoke`、`status-result-consistency-smoke`、`idempotency-key-deduplication-smoke`。
- `UNBLOCK production-queue-broker ...`：列出解除 blocker 的真实通过标准，交接报告应引用这些行，而不是把 skeleton 或 mock-production 写成通过。

拿到真实凭据后的建议执行顺序：

1. 先运行 `corepack pnpm readiness:external-blockers`，确认缺失项只剩真实 smoke，而不是 env/config/credential 缺口。
2. 配置真实密钥库，运行 provider response、provider health、audit metadata redaction smoke，确保无明文 secret 回显。
3. 启动至少两个 API 实例共享同一 session invalidation store，执行跨实例 logout/login rotation smoke。
4. 启动真实 Redis/RabbitMQ/SQS broker 和至少两个 worker，执行 lease、retry/dead-letter、heartbeat、status-result consistency、idempotency smoke。
5. 最后运行 `PRODUCTION_SMOKE_MODE=real-sandbox corepack pnpm smoke:production`，必要时打开 `PRODUCTION_SMOKE_RUN_RECOGNITION=true` 和 `PRODUCTION_SMOKE_RUN_WRITEBACK=true`。

真实通过标准：

- `smoke:production` 在真实 sandbox 下 exit code 0，并且 `SUMMARY_JSON.status=passed`。
- 写回只基于服务端 `payload.writeback.readyFields`，即 `writeback-readyFields-only-smoke` 通过。
- 任何 provider health、secret resolver、session store 或 queue posture 为 `productionReady=false` 时，最终产品仍 blocked。

失败排查方向：

- real sandbox 登录失败：检查 `PRODUCTION_SMOKE_BASE_URL`、账号权限、cookie/JWT 兼容、`PRODUCTION_SMOKE_EXPECTED_MODE`。
- provider health blocked：检查 secretRef 名称、真实密钥库读取权限、OCR/LLM endpoint、网络 ACL，不要把明文 key 写入 provider config。
- writeback blocked：检查识别结果是否存在 `payload.writeback.readyFields`、任务是否 completed/confirmed、LIMS sandbox token 与幂等 key。
- session smoke 失败：检查两个实例是否真的共享 database/Redis store、TTL 是否过短、store 中是否只有 token hash。
- queue smoke 失败：检查 broker URL、visibility timeout、retry limit、dead-letter queue、worker concurrency、idempotency key 和 status/result 持久化一致性。

## 真实 sandbox smoke

真实外部 OCR/LLM/LIMS 仍是 remaining/blocked，必须由部署方提供 sandbox。`pnpm smoke:production` 会输出 `STATUS passed|blocked|failed`。缺少真实外部凭据时会输出 `MODE blocked`、`STATUS blocked`，并分别列出 `configuration`、`secret-resolver`、`session-invalidation-store`、`queue-broker` blocked 条件，不能把该状态写成通过。

`pnpm smoke:production` 同时输出：

- `NEXT <step> <nextAction>`：面向部署方的下一步动作。
- `REQUIRED_CHECKS <step> <requiredChecks>`：解除 blocked 前必须补跑的真实环境检查。
- `SUMMARY_JSON {...}`：供 CI/readiness/handoff 解析的机器可读摘要。

真实 sandbox 环境即使可登录，也必须检查 `/status` 的脱敏 dependency posture：`secretResolver.productionReady=false`、`sessionInvalidationStore.productionReady=false` 或 `queue.productionReady=false` 时，`smoke:production` 会继续输出 `STATUS blocked`，直到真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store 和真实 broker 多实例 smoke 均完成。

必需配置：

- `PRODUCTION_SMOKE_MODE=real-sandbox`
- `PRODUCTION_SMOKE_BASE_URL`
- `PRODUCTION_SMOKE_EMAIL`
- `PRODUCTION_SMOKE_PASSWORD`
- `PRODUCTION_SMOKE_EXPECTED_MODE=production`
- `PRODUCTION_SMOKE_SCHEMA_KEY`
- `PRODUCTION_SMOKE_JOB_POLL_INTERVAL_MS`
- `PRODUCTION_SMOKE_JOB_POLL_TIMEOUT_MS`

可选真实识别：

- `PRODUCTION_SMOKE_RUN_RECOGNITION=true`
- `PRODUCTION_SMOKE_OCR_PROVIDER_KEY`
- `PRODUCTION_SMOKE_PROVIDER_KEY`
- `PRODUCTION_SMOKE_SYNTHETIC_FILE_NAME`
- `PRODUCTION_SMOKE_SYNTHETIC_MIME_TYPE`
- `PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64`

可选真实写回：

- `PRODUCTION_SMOKE_RUN_WRITEBACK=true`
- 只能基于本次识别结果中的 `payload.writeback.readyFields` 调用。

不能把 `mock-production` 当作真实外部 sandbox 通过。`PRODUCTION_SMOKE_MODE=mock-production` 只用于本地 contract smoke。
不能把 mock-production 当作真实外部 sandbox 通过，这是最终验收边界。

## Provider 与密钥

当前代码支持 `secretRefs` 和 env secret resolver，但真实 KMS/Vault/Secret Manager 仍是 remaining/blocked。

本轮已补代码侧 SecretResolver contract：

- `SecretResolver` 作为运行时接口，Provider runtime 只通过 `secretRefs` 解析密钥，不从 provider config 明文字段读取。
- `createSecretResolverFromEnv()` 根据 `SECRET_RESOLVER_PROVIDER` 创建 resolver；默认 `env` 只代表环境变量注入，不代表真实密钥库。
- `buildSecretResolverContract()` 会输出 `SECRET_RESOLVER_ENV_ONLY`、`SECRET_RESOLVER_CONTRACT_INCOMPLETE` 或 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`。
- `SECRET_RESOLVER_PROVIDER=vault` 必须配置 `VAULT_ADDR`、`VAULT_TOKEN`；仓库当前不会伪造 Vault SDK 调用。
- `SECRET_RESOLVER_PROVIDER=kms` 必须配置 `KMS_KEY_ID`、`KMS_REGION`；仓库当前不会伪造 KMS SDK 调用。
- `SECRET_RESOLVER_PROVIDER=secret-manager` 必须配置 `SECRET_MANAGER_PROJECT`、`SECRET_MANAGER_REGION`；仓库当前不会伪造 Secret Manager SDK 调用。
- `createVaultSecretResolver()`、`createKmsSecretResolver()`、`createSecretManagerResolver()` 已提供 provider-specific skeleton；只有部署方注入真实 client/SDK 后才会读取外部密钥库。无 client 时必须返回 `SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED`。
- Provider health 的 blocked 输出只返回 provider key、secretRef、resolver source 和 blocked reason，不返回明文 secret。
- Provider API response、provider health response 和 audit metadata response 会做出口层脱敏；部署方仍应执行 `provider-response-secret-redaction-smoke`、`provider-health-secret-redaction-smoke` 和 `audit-metadata-secret-redaction-smoke`，防止 registry、外部 health adapter 或历史审计数据把明文密钥带回 HTTP 响应。

部署方需要提供：

- Provider secret ref 命名规范，例如 `OCR_HTTP_API_KEY_REF`、`LLM_HTTP_API_KEY_REF`、`LIMS_API_TOKEN_REF`。
- KMS/Vault/Secret Manager 的 resolver 实现和启动配置。
- 密钥读取失败时的启动或 provider health fail-fast 策略。
- 审计策略：只记录 secret ref 和 provider key，不记录明文密钥。

当前不得声明“真实 KMS 已接入”。只能声明“env resolver contract 可用，真实 KMS/Vault/Secret Manager 待部署接入”。

## 生产多实例会话失效

当前浏览器会话已支持 HttpOnly `mra_session` cookie、登出清 cookie、登录轮换旧 session 和前端生产默认不持久化 JWT。但生产多实例 session invalidation store 仍是 remaining/blocked。

本轮已补代码侧 contract：

- `SessionInvalidationStore` 是 auth service 的集中化失效边界。
- 默认 `createInMemorySessionInvalidationStore()` 只用于本地单实例闭环；它只保存 token hash、支持 TTL，但 `productionReady=false`、`SESSION_INVALIDATION_STORE_IN_MEMORY`。
- `createRepositorySessionInvalidationStore()` 通过 repository contract 写入 `tokenHash`、`invalidatedAt`、`expiresAt`，不持久化原始 JWT/cookie 值。
- `buildProductionSessionInvalidationStoreContract()`：默认未配置时返回 `SESSION_INVALIDATION_STORE_IN_MEMORY`；`SESSION_INVALIDATION_STORE_MODE=repository` 时必须配置 `SESSION_INVALIDATION_STORE_PROVIDER=database|redis` 和 `SESSION_INVALIDATION_TTL_MS`。
- `createProductionSessionInvalidationStore()` 只有在配置完整且注入 repository/adapter 时才返回 repository-backed store；该 store 仍返回 `productionReady=false`、`SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN`，不能声明生产多实例会话失效通过。
- 本地可执行 adapter skeleton 已补齐：database delegate 和 Redis client 注入后均只写 token hash、TTL，不写原始 JWT/cookie；可用 `corepack pnpm readiness:session-invalidation` 运行本地 contract 诊断。该脚本预期 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`，不能替代真实双实例共享 store smoke。
- `/status` 会返回脱敏 `sessionInvalidationStore` posture，`pnpm smoke:production` 在其非生产就绪时输出 `session-invalidation-store` blocked step。

生产部署需要提供数据库或 Redis repository/adapter，并完成多实例 smoke：

- 至少 2 个 API 实例共享同一 invalidation store。
- 实例 A 登录，实例 B 可通过 cookie 鉴权。
- 实例 A 登出或登录轮换旧 session 后，实例 B 对同一旧 cookie 返回 `401`。
- store 中只存在 token hash 和 TTL，不存在原始 JWT、cookie header 或明文 secret。
- 失效记录过期后可清理，不影响审计和安全诊断。

在这些完成前，生产多实例 session invalidation store 与医疗最终产品不得写通过。

## 可靠队列

当前 job queue 已从本地进程内最小闭环推进到 Redis broker adapter skeleton，但仍不满足多实例生产可靠队列最终验收。

本轮已补代码侧 contract：

- `JobQueueAdapter` 是 API service 消费的队列边界，当前 in-process 实现暴露 `describe()` 能力声明。
- in-process adapter 只用于本地单实例闭环；它有最小 lease/retry/dead-letter/heartbeat contract，但 `productionReady=false`、`QUEUE_BROKER_NOT_CONFIGURED`。
- `buildProductionQueueContract()`：默认 `QUEUE_MODE=in-process` 时返回 `productionReady=false`、`configReady=false` 和 `QUEUE_BROKER_NOT_CONFIGURED`。
- `QUEUE_MODE=broker` 时必须配置 broker provider、broker URL、queue name、visibility timeout、retry limit 和 dead-letter queue；缺项返回 `QUEUE_BROKER_CONTRACT_INCOMPLETE`。
- `QUEUE_BROKER_PROVIDER=redis` 已有 `createRedisJobQueueAdapter()` skeleton 和 mockable `RedisJobQueueClient` 抽象，单元测试覆盖 enqueue、lease、retry、dead-letter、heartbeat、idempotency key。
- `corepack pnpm readiness:queue-broker` 会执行本地 in-process adapter contract、Redis broker skeleton contract、status/result consistency contract，并输出 `SUMMARY_JSON`。该脚本只证明本地 contract，真实多实例 broker smoke 未跑通前必须保持 `QUEUE_BROKER_SMOKE_NOT_RUN`。
- `createProductionJobQueueAdapter()` 只有在 broker 配置完整且注入 Redis client 时才返回 Redis adapter skeleton；该 adapter 仍返回 `productionReady=false`、`QUEUE_BROKER_SMOKE_NOT_RUN`，不能声明多实例可靠队列通过。
- `QUEUE_MODE=broker` 配置完整但没有 Redis/RabbitMQ/SQS client/adapter 时只代表 `configReady=true`，仍返回 `QUEUE_BROKER_ADAPTER_NOT_CONNECTED`。
- `assertProductionQueueContract()` 可用于部署启动前 fail-fast；它只校验配置和 adapter 接入状态，不代表真实 broker 已通过 smoke。

生产部署需要把队列切到 broker，例如：

- `QUEUE_MODE=broker`
- `QUEUE_BROKER_PROVIDER=redis`
- `QUEUE_BROKER_URL`
- `QUEUE_NAME=medical-recognition-jobs`
- `QUEUE_VISIBILITY_TIMEOUT_MS`
- `QUEUE_RETRY_LIMIT`
- `QUEUE_DEAD_LETTER_QUEUE`
- `WORKER_CONCURRENCY`

推荐 broker：Redis/RabbitMQ/SQS。必须补齐：

- 持久化 job lease。
- worker 幂等消费。
- retry 和 dead-letter。
- worker 心跳与超时恢复。
- job status/result consistency。
- 队列积压和失败监控。
- 多实例下的 status/result 一致性测试。
- 真实 broker smoke：启动至少 2 个 worker，提交脱敏识别 job，验证单任务只被一个 worker lease、失败重试达到上限后进入 dead-letter、heartbeat 超时可恢复、重复 idempotency key 不重复入队，且 job status/result 在 API 与 worker 多实例间保持一致。

在这些完成前，项目最终产品不得写通过。

## 最终验收边界

可以写通过：

- UI 当前阶段。
- 本地浏览器 E2E 阶段。
- 本地 demo-web runtime smoke。
- mock-production contract smoke。

不能写通过：

- 真实外部 OCR/LLM/LIMS sandbox。
- 真实 KMS/Vault/Secret Manager。
- 生产多实例 session invalidation store。
- 多实例持久化可靠队列。
- 医疗项目最终产品。
