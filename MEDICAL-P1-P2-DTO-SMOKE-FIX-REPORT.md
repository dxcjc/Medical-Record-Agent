# Medical P1/P2 DTO Smoke Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行；未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录。

## 修复点

- API route DTO 收敛：
  - 新增 `apps/api/src/routes/route-dtos.ts`，用 Zod 定义 files、jobs、feedback、evaluation samples 的请求 DTO 与结构化响应对象类型。
  - `POST /files` 不再把原始 body 直传 service，非法 body 返回 400；`uploadedById/storageKey` 等客户端伪造字段会被剥离。
  - `POST /jobs` 只接受 `schemaKey/schemaVersionId/sourceFileId/document/options/providerConfig` 白名单；`providerConfig` 只允许 provider key，不接收客户端 secret。
  - `POST /feedback` 支持 `field`/`fieldKey` 归一化，非法 body 返回 400，剥离 `createdById` 等客户端字段。
  - `POST /evaluations/datasets/:id/samples` 要求非空对象样本数组，并剥离样本外层未知字段。
  - `apps/api/src/services/api-services.ts` 对 files/jobs/feedback/evaluation 的 route response 做对象/对象数组边界校验，避免 scalar 被当作成功响应。
- Writeback 可信边界保持：
  - 既有 `POST /writeback` 继续只接收 `jobId/confirmed/idempotencyKey`，客户端 `fields/payload` 不会传入执行服务。
- Production smoke blocked 可诊断性：
  - `scripts/production-smoke.ts` 的 blocked report 增加 `code/missingKeys/provider/adapter/requiredExternal`。
  - CLI 保留 `MODE/STATUS/BLOCKED` 文本行，并新增 `SUMMARY_JSON` 单行机器可读摘要。
  - blocked 明确区分 `configuration`、`secret-resolver`、`session-invalidation-store`、`queue-broker`。
- Production readiness gate：
  - `scripts/deployment-readiness-gate.ts` 的最终 blocked reason 明确区分本地 readiness、真实外部集成和医疗最终产品。

## 关键文件

- `apps/api/src/routes/route-dtos.ts`
- `apps/api/src/routes/files.routes.ts`
- `apps/api/src/routes/jobs.routes.ts`
- `apps/api/src/routes/feedback.routes.ts`
- `apps/api/src/routes/evaluation.routes.ts`
- `apps/api/src/services/api-services.ts`
- `apps/api/src/routes/base.routes.test.ts`
- `apps/api/src/routes/evaluation.routes.test.ts`
- `scripts/production-smoke.ts`
- `scripts/production-smoke.test.ts`
- `scripts/deployment-readiness-gate.ts`
- `scripts/deployment-readiness-gate.test.ts`
- `docs/superpowers/plans/2026-06-09-p1-p2-dto-smoke-closure.md`

## 测试

- `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts`：先红后绿，最终 49 passed。
- `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts`：68 passed。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS warning；该命令输出入口 `index-GKrOmEWy.js`。
- `corepack pnpm test`：67 passed、1 skipped files；377 passed、1 skipped tests；仍有既有 `DEP0040 punycode` warning。
- `corepack pnpm smoke:production`：exit code 2，按预期 blocked；不是 failed，也不是 passed。

## Production Smoke Blocked

`corepack pnpm smoke:production` 当前输出：

- `MODE blocked`
- `STATUS blocked`
- `configuration`: 缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`
- `secret-resolver`: `SECRET_RESOLVER_ENV_ONLY`
- `session-invalidation-store`: `SESSION_INVALIDATION_STORE_IN_MEMORY`
- `queue-broker`: `QUEUE_BROKER_NOT_CONFIGURED`
- `SUMMARY_JSON`: 含上述四类 blocked step 的机器可读摘要。

## 剩余 Blocked

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox URL、账号、密码、provider key、LIMS 写回环境和脱敏样本 smoke。
- 真实 KMS/Vault/Secret Manager：blocked，env-only resolver 不能代表生产密钥库。
- 生产多实例 session invalidation store：blocked，当前 in-memory 不能代表多实例共享失效；需真实数据库/Redis repository 和多实例 logout/rotation smoke。
- 真实 broker 多实例可靠队列：blocked，需真实 Redis/RabbitMQ/SQS、worker 绑定、lease/retry/dead-letter/heartbeat/status consistency smoke。

## 分层结论

- UI 当前阶段：通过。
- P1/P2 本轮可落地项：通过，DTO/smoke/readiness 本地闭环。
- 真实外部集成：blocked。
- 医疗最终产品：blocked，不能写最终完成。
