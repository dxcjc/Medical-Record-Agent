# 2026-06-10 P1/P2 Continuation Round3 Served Readiness

本轮按用户要求执行 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion`。仓库根目录未找到 `CLAUDE.md`；已读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md`、`MEDICAL-P2-NEXT-LOCAL-CLOSURE-AUDIT-REPORT.md`、`MEDICAL-P2-ASYNC-HANDOFF-AUDIT-REPORT.md`、`MEDICAL-P2-EXTERNAL-BLOCKER-READINESS-AUDIT-REPORT.md`。

## Brainstorming

现状分层：

- 已代码落地：前端 typecheck/build、Material + Arco style/mobile guard、route DTO、写回 readyFields 可信边界、demo/mock contract smoke、external blocker readiness、queue/session skeleton readiness。
- 本地可继续修复：9901 实际 served 首页与 `apps/demo-web/dist/index.html` bundle 一致性目前靠人工 `curl` 和报告描述，没有独立可复跑 readiness gate；deployment readiness 聚合也没有显式展示该本地 served artifact gate。
- 必须等外部依赖：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 Redis/RabbitMQ/SQS 多 worker broker smoke。

选择本轮最高价值本地项：新增 `readiness:served-app`，把 `http://localhost:9901/`、`http://localhost:9901/api/health`、served 首页 bundle 与 dist bundle 一致性做成可测试脚本。该脚本只能证明本地 9901 served artifact ready；若 9901 未运行或 bundle 不一致，输出 blocked/failed，不影响真实外部集成仍 blocked 的结论。

## Writing Plan

1. 先补 `scripts/served-app-readiness.test.ts`，要求：
   - 从 HTML 提取 Vite JS bundle。
   - 对比 served 首页和 dist 首页的 bundle，匹配时本地 readiness passed。
   - 9901 不可访问时返回 exit code 2，并输出 blocked code。
   - bundle 不一致时返回 failed，防止旧产物被误写通过。
2. 实现 `scripts/served-app-readiness.ts`。
3. 增加 `package.json` 脚本 `readiness:served-app`。
4. 将 deployment readiness 聚合纳入该 gate，但保持其不代表真实外部集成。
5. 更新 `docs/2026-06-09-p2-production-handoff.md` 的本地 gate 和执行顺序。

## TDD

- 先运行定向测试确认红灯：`corepack pnpm vitest run scripts/served-app-readiness.test.ts scripts/deployment-readiness-gate.test.ts`。
- 实现后重新运行同一组测试直到绿。

## Verification Before Completion

完成后必须运行并记录：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm test`
- `corepack pnpm readiness:served-app`
- `curl` 检查 `http://localhost:9901/` 和 `http://localhost:9901/api/health`，确认 served 首页引用 bundle 与 `apps/demo-web/dist/index.html` 一致；不可访问则报告 blocked 原因。
