# 2026-06-09 P2 Deployment Readiness Plan

> 本轮继续按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

## Brainstorming

指定报告显示 UI 当前阶段通过，本地 P1/P2 工程化多轮通过，但医疗项目最终产品仍不通过。remaining/blocked 不在 UI，而在真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例可靠队列和真实 production smoke。

本轮不重复 UI patch，优先补齐部署交接可执行性：

- 增加 deployment readiness gate：汇总 typecheck、全量测试、demo-web 样式/移动/build/smoke、浏览器 E2E、mock-production smoke 和真实 production smoke，输出 JSON/文本分层结论。
- 强化 production smoke 依赖诊断：从 `/status` 读取 secret resolver 与 queue posture，`productionReady=false` 时输出 blocked，不把真实环境依赖缺失误判为 passed。
- 更新 handoff 文档：明确命令、exit code、passed/blocked/fail 判定和真实外部条件的最终验收边界。

## TDD Tasks

- [x] 新增 `scripts/deployment-readiness-gate.test.ts`：用注入 runner 验证命令矩阵、local readiness 通过、real production blocked、final product blocked 的分层汇总。
- [x] 增强 `scripts/production-smoke.test.ts`：缺配置 blocked 报告必须带具体 secret/queue blocked code；`/status` 暴露 secret resolver 或 queue 非生产时，真实 smoke 必须 blocked。
- [x] 增强 `docs/p2-production-handoff.test.ts`：交接文档必须包含 readiness gate、exit code、真实 broker/secret/sandbox 验收命令。

## Implementation Tasks

- [x] 新增 `scripts/deployment-readiness-gate.ts` 和 `readiness:deployment` package script。
- [x] 更新 `scripts/production-smoke.ts`，补 status runtime dependency 诊断和更清晰的 preflight blocked 文案。
- [x] 在 production `/status` runtime 中暴露脱敏 secret resolver contract，确保 smoke 可以远程判定 KMS/Vault/Secret Manager blocked。
- [x] 更新 `docs/2026-06-09-p2-production-handoff.md` 和本轮两份报告。

## Verification

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`
- [x] `corepack pnpm smoke:demo-web`
- [x] `corepack pnpm e2e:demo-web:browser`
- [x] `corepack pnpm smoke:production`
- [x] `PRODUCTION_SMOKE_MODE=mock-production PRODUCTION_SMOKE_RUN_WRITEBACK=1 corepack pnpm smoke:production`
- [x] `corepack pnpm readiness:deployment`
