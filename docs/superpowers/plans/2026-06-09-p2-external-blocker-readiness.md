# 2026-06-09 P2 External Blocker Readiness

## Brainstorming

- 已读取本轮指定 continuation、产品审计、next local closure 审计/修复、生产交接文档和既有 P1/P2 报告。
- 当前结论：UI 当前阶段和本地 typecheck/test/demo-web style/mobile/build/9901 基础检查已有阶段通过记录，但这不是医疗项目最终完成。
- 最新可本地继续推进的高价值项：把真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列的 blocked 条件固化为更清晰的 readiness gate、诊断输出、测试和交接说明。
- 不接入假外部服务，不把 skeleton 或 mock-production 标记为 production ready；缺真实凭据时 readiness 命令应以 exit code 2 表示预期 blocked。

## Writing Plan

1. TDD：先增强 `scripts/external-blocker-readiness.test.ts`，要求每个 blocker 输出 `readinessGate`，分层列出 env/config/endpoint/credential/smoke 状态、缺失项、pending smoke 和解锁条件。
2. TDD：先增强 `scripts/production-smoke.test.ts`，要求 blocked production smoke 的 `requiredChecks` 覆盖真实 provider connectivity、writeback readyFields-only、secret redaction、status-result consistency、idempotency 等交接 smoke。
3. 实现：
   - 更新 `scripts/external-blocker-readiness.ts`，从当前 env 计算每个 blocker 的 gate 状态，保留 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
   - 更新格式化输出，增加 `GATE` 和 `UNBLOCK` 行，便于 CI/交接人直接定位缺 env/config/endpoint/credential/smoke。
   - 更新 `scripts/production-smoke.ts` blocked diagnostics 的 requiredChecks，使 `readiness:deployment` 和 `smoke:production` 口径一致。
   - 更新 `docs/2026-06-09-p2-production-handoff.md` 和文档测试，明确真实凭据到位后的执行顺序、通过标准和失败排查。
4. Verification before completion：
   - 运行定向测试证明先红后绿。
   - 运行用户指定完整验证命令。
   - 运行新增/修改 readiness 命令，缺真实外部依赖时接受 exit code 2，并记录这是 expected blocked。
   - 检查 9901 `/` 与 `/api/health`，确认 dist HTML 和 served HTML 引用同一真实 bundle。

## Acceptance Boundary

- 可以写 UI 当前阶段通过。
- 可以写本轮本地 external blocker readiness/交接闭环通过。
- 不允许写医疗最终产品完成或通过，除非真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session store、真实 broker 多实例可靠队列全部真实验证通过。
