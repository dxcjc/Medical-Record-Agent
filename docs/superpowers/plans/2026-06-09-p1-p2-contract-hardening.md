# 2026-06-09 P1/P2 Contract Hardening

## Brainstorming

- 已先读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md`、`MEDICAL-P2-PRODUCTION-CLOSURE-AUDIT-REPORT.md` 和 `docs/2026-06-09-p2-production-handoff.md`。
- 当前 UI 阶段和上一轮 DTO/smoke/readiness 本地项已验证通过；真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 队列仍然 blocked。
- 本轮继续收敛本地可落地的业务/安全/集成残余，不伪造外部条件：
  - Provider route 已拒绝保存明文密钥，但 response 层只对 `secretRefs` 做脱敏；如果 service/registry/health 将 `config.apiKey`、`headers.Authorization`、`secretDiagnostics.value` 或带 Bearer 的 message 返回，仍需统一 scrub。
  - Audit middleware 当前写入安全 metadata，但历史记录或外部导入的 audit metadata 可能包含 authorization、x-api-token、password、apiKey；list route 应在响应前兜底脱敏。
  - Handoff 需要把 provider response/log/health 和 audit metadata 脱敏 smoke 写清楚，并继续标注真实外部依赖 blocked。

## Writing Plan

- [x] 读取指定报告与当前 providers/schemas/audit/service 代码。
- [x] 先补红灯测试：
  - Provider route 对嵌套 `apiKey`、`Authorization`、`clientSecret`、`secretDiagnostics.value` 和 Bearer 字符串做响应脱敏。
  - Audit list route 对历史 metadata 中的认证头、token、password、apiKey 做响应脱敏，但保留 `actorApiTokenId` 这类安全标识字段。
  - Handoff 文档说明 provider health/log/response 与 audit metadata redaction smoke。
- [x] 实现：
  - 在 route DTO/guard 层新增共享响应脱敏 helper。
  - Provider route 使用统一 helper 代替只 masking `secretRefs`。
  - Audit route 对 list response 统一 scrub。
  - 更新生产交接文档。
- [x] 验证：
  - 跑新增定向 vitest，确认红灯后绿灯。
  - 跑用户指定 style/mobile/build/full test。
  - 检查 `http://localhost:9901/`、`/api/health` 和 dist bundle 引用。
- [x] 报告：
  - 生成 `MEDICAL-P1-P2-CONTRACT-HARDENING-FIX-REPORT.md`。
  - 生成 `MEDICAL-P1-P2-CONTRACT-HARDENING-AUDIT-REPORT.md`，包含 7 维度和分层结论。

## TDD Notes

- 测试先于实现；本轮不接假 KMS、假 broker 或假 sandbox。
- 响应脱敏只处理安全边界，不改变 provider 保存和真实 runtime 注入逻辑。
- `secretRef` 名称可以返回；明文 secret、token、Authorization、cookie 和 resolved secret value 不可返回。

## Verification Before Completion

已执行并记录：

- `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts`：先红后绿；最终 21 tests passed。
- `corepack pnpm vitest run docs/p2-production-handoff.test.ts`：先红后绿；最终 5 tests passed。
- `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts docs/p2-production-handoff.test.ts`：81 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed / 14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500 kB JS chunk warning；单独 build 输出入口 `index-B7lcWWvU.js`。
- `corepack pnpm test`：通过，68 passed / 1 skipped files；402 passed / 1 skipped tests；只有既有 `DEP0040 punycode` warning。全量测试中的 Vite chunking guard 再次构建 dist，当前 `dist/index.html` 引用 `index-DQ-Z7-_K.js`。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:production`：exit code 2，预期 blocked；configuration、secret-resolver、session-invalidation-store、queue-broker blocked，输出 `SUMMARY_JSON`。
- `curl -I --max-time 5 http://localhost:9901/`：200 OK。
- `curl --max-time 5 http://localhost:9901/api/health`：200 OK，`{"status":"ok","service":"medical-record-agent-api"}`。
- 检查 `apps/demo-web/dist/index.html`：引用 `/assets/index-DQ-Z7-_K.js`，对应文件存在。

## Acceptance Boundary

- UI 当前阶段：只在 style/mobile/build 与 9901 基础访问通过时写通过。
- P1/P2 本轮 contract/security/handoff 阶段：只对 provider/audit response redaction 和 handoff 可执行性交接写通过。
- 真实外部集成：没有真实 sandbox/KMS/session store/broker 前继续 blocked。
- 医疗项目最终产品：真实外部集成、生产多实例安全和可靠队列全部通过前继续 blocked。
