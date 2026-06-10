# 2026-06-09 P1/P2 DTO Smoke Closure

## Brainstorming

- 已先读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md` 和最新 P2 session/queue、typecheck 审计/修复报告。
- 当前可信结论：UI 当前阶段与本地 readiness 可继续守住；真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列和 production smoke 仍 blocked。
- 本轮可本地闭环的最高价值项：
  - 从旧 P1-6 继续收敛 route/service 契约，优先覆盖 files、jobs、feedback、evaluation 与 writeback 的请求/响应 DTO。
  - 保留 writeback 只接受确认 DTO 的安全边界，不重新引入客户端 fields/payload。
  - production smoke blocked 输出增加机器可读 JSON，明确 configuration、secret-resolver、session-invalidation-store、queue-broker 的 blocked 分类。
  - readiness gate 文案继续分层：本地通过不等于生产上线，也不等于医疗最终产品完成。

## Writing Plan

- [x] 读取指定报告和最新 P2 报告。
- [x] 先补测试：
  - route DTO：files/jobs/feedback 非法 body 返回 400，合法 body 只把 schema 允许字段传给 service。
  - evaluation samples：样本数组内元素必须是对象，空数组拒绝。
  - writeback：继续验证客户端 fields/payload 被丢弃。
  - production smoke：blocked 输出能生成 JSON summary，包含 missing env keys 与四类 blocked step。
  - readiness gate：final product blocked 原因明确包含 local readiness、external integration、final medical product 的分层边界。
- [x] 实现：
  - 新增 API route DTO/Zod schema 模块。
  - 路由层使用 DTO 解析，减少高风险 route service `unknown` 输入。
  - production smoke CLI 输出 `SUMMARY_JSON` 单行机器可读摘要。
  - readiness gate final reason 明确本地/外部/最终产品分层。
- [x] 验证：
  - 跑定向 vitest。
  - 跑用户指定 demo-web style/mobile/build、全量 pnpm test。
  - 跑 `corepack pnpm smoke:production`，预期仍 blocked。
- [x] 报告：
  - 更新 `MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md` 七维报告。
  - 新增 `MEDICAL-P1-P2-DTO-SMOKE-FIX-REPORT.md`，记录修复文件、测试和剩余 blocked。

## TDD Notes

- 测试必须先于实现落地。
- DTO 解析失败使用 400；writeback 业务状态冲突仍保持 409。
- 真实外部依赖缺失时，production smoke 只能 blocked，不能写 passed 或 failed。

## Verification Before Completion

Required commands:

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`: passed, 19 tests.
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`: passed, 5 passed / 14 skipped.
- `corepack pnpm --filter @medical-record-agent/demo-web build`: passed, no 500 kB JS warning in command output; entry bundle `index-GKrOmEWy.js`.
- `corepack pnpm test`: passed, 67 passed / 1 skipped files; 377 passed / 1 skipped tests; existing `DEP0040 punycode` warnings remain.
- `corepack pnpm smoke:production`: exit code 2, expected blocked; `MODE blocked`, `STATUS blocked`, blocked steps `configuration`, `secret-resolver`, `session-invalidation-store`, `queue-broker`; output includes `SUMMARY_JSON`.

Targeted commands:

- `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts`: first run failed as intended before implementation; rerun passed, 49 tests.
- `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts`: passed, 68 tests.
- `corepack pnpm typecheck`: passed.

## Acceptance Boundary

- UI 当前阶段：守住 style/mobile/build，通过才可写当前阶段通过。
- P1/P2 本轮可落地项：DTO/smoke/readiness 本地测试通过才可写通过。
- 真实外部集成：无真实 sandbox/KMS/session store/broker 前继续 blocked。
- 医疗最终产品：真实外部集成、生产多实例安全性和可靠队列全部通过前继续 blocked。
