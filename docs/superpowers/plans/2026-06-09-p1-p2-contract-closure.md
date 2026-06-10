# 2026-06-09 P1/P2 Contract Closure

## Brainstorming

- 已先读取用户指定的 continuity、产品审计、rollup、production closure、security/e2e、session/queue hardening 和生产交接文档。
- 当前可写通过的边界仍只限 UI 当前阶段与本地可验证 P1/P2 工程项；真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 和真实 production smoke 继续 blocked。
- 上轮已覆盖 files/jobs/feedback/evaluation/writeback 的 DTO 和 blocked smoke 诊断。本轮最高价值本地项是继续收敛仍宽松的 providers/audit route contract：
  - Provider 配置保存不得接收 `config` 中的明文密钥、token、password 或 authorization header，真实密钥只能通过 `secretRefs` 间接引用。
  - `secretRefs` 只允许非空字符串引用，避免对象/数组/布尔等宽类型进入 provider registry。
  - Audit 查询的非法 `take` 明确返回 400，不再静默忽略，减少分页契约漂移。

## Writing Plan

- [x] 读取指定报告与当前 route/test 实现。
- [x] 先补红灯测试：
  - `PUT /providers/:key` 拒绝 `config.apiKey`、`config.headers.Authorization` 等疑似明文密钥。
  - `PUT /providers/:key` 拒绝非字符串/空字符串 `secretRefs`。
  - `GET /audit?take=not-a-number` 返回 400 且不调用 service。
- [x] 实现：
  - 在 `route-dtos.ts` 收窄 provider config/secretRefs/audit query schema。
  - 保持 provider response secretRefs 脱敏和错误不泄密。
  - 更新既有 audit 测试口径。
- [x] 验证：
  - 运行 providers/audit 定向 vitest。
  - 运行用户指定 style/mobile/build/full test。
  - 检查 9901 `/` 和 `/api/health`。
- [x] 报告：
  - 生成 `MEDICAL-P1-P2-CONTRACT-CLOSURE-FIX-REPORT.md`。
  - 生成 `MEDICAL-P1-P2-CONTRACT-CLOSURE-AUDIT-REPORT.md`，包含 7 维度和分层结论。

## TDD Notes

- 测试必须先落地并确认红灯，再实现 DTO。
- 本轮不接真实外部依赖，也不把 blocked 改写为 passed。
- 本轮不改 UI CSS；若 style/mobile/build 失败需如实记录。

## Verification Before Completion

Required commands:

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`: passed, 19 tests.
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`: passed, 5 passed / 14 skipped.
- `corepack pnpm --filter @medical-record-agent/demo-web build`: passed, no 500 kB JS warning; `vendor-arco` JS chunk 415.91 kB.
- `corepack pnpm test`: passed, 68 passed / 1 skipped files; 398 passed / 1 skipped tests; existing `DEP0040 punycode` warnings remain.

Targeted commands:

- `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts`: first run failed as intended before implementation; rerun passed, 18 tests.
- `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/services/api-services.test.ts apps/api/src/demo-services.test.ts apps/demo-web/src/pages/operations/ProviderSettingsPage.test.ts apps/demo-web/src/api/client.test.ts`: passed, 69 tests.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm smoke:production`: exit code 2, expected blocked; missing real sandbox credentials, real secret resolver, production multi-instance session store and real broker.

Required local checks:

- `http://localhost:9901/`: 200 OK.
- `http://localhost:9901/api/health`: 200 OK, `{"status":"ok","service":"medical-record-agent-api"}`.

## Acceptance Boundary

- UI 当前阶段：只在 style/mobile/build 和 9901 基础访问通过时写通过。
- P1/P2 本轮工程项：只对 provider/audit contract hardening 写本地通过。
- 真实外部集成：无真实凭据和生产依赖前继续 blocked。
- 医疗最终产品：真实外部集成、生产多实例安全和可靠队列全部通过前继续 blocked。
