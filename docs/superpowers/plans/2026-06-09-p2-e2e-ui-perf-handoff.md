# 2026-06-09 P2 E2E/UI/Perf/Handoff Plan

> 本计划按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

## Brainstorming

当前 UI 阶段和上一轮 P1/P2 smoke 已通过，但医疗项目最终产品仍未完成。剩余 P1/P2 中，本轮可在本地闭环的是：

- 增加真实浏览器 E2E 能力，并在 Playwright/浏览器依赖不可用时输出明确 blocked。
- 对 AppShell、页面 header、卡片、表格、表单和移动端触摸区做增量 guard 和小范围 CSS 修复。
- 复查 demo-web chunk 策略，保留路由懒加载和单一 vendor-arco，避免恢复 Arco 细拆 circular warning。
- 把真实外部 OCR/LLM/LIMS sandbox、KMS/Vault/Secret Manager 和多实例可靠队列转成部署交接清单。

不在本轮伪造完成：

- 真实外部 OCR/LLM/LIMS sandbox smoke。
- 真实 KMS/Vault/Secret Manager。
- 多实例持久化 broker/worker/lease/dead-letter 可靠队列。

## TDD Tasks

- [x] 新增 `scripts/demo-web-browser-e2e.test.ts`，先约束 `browserE2E=passed/blocked` 汇总、截图目录和 blocked 原因。
- [x] 增强 `apps/demo-web/src/ui-arco-style-guards.test.ts`，覆盖移动端 topbar 44px、header 防溢出、表格横滚和侧栏遮挡 guard。
- [x] 增强 `apps/demo-web/src/viteChunking.test.ts`，防止提高 chunk warning 阈值或恢复 Arco 子 chunk。
- [x] 新增/更新文档测试或报告，确认外部 sandbox/KMS/队列保持 remaining/blocked 语义。

## Implementation Tasks

- [x] 新增 `scripts/demo-web-browser-e2e.ts`。
  - 优先探测 Playwright。
  - Playwright 缺失时探测本地浏览器依赖并输出 blocked，不把 runtime smoke 冒充浏览器 E2E。
  - 能运行时覆盖 `/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback` 和移动端布局，并保存截图到 `ui-parity-screenshots/medical-e2e-current/`。
- [x] 增加 root script `e2e:demo-web:browser`。
- [x] 小范围更新 `styles.css`，不重写设计系统。
- [x] 更新 README/docs handoff，列出部署方必须配置的 env、sandbox、KMS/Vault、队列/broker 和 CI smoke 参数。
- [x] 生成 `MEDICAL-P2-E2E-UI-PERF-FIX-REPORT.md` 与 `MEDICAL-P2-E2E-UI-PERF-AUDIT-REPORT.md`。

## Verification

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`
- [x] `corepack pnpm smoke:demo-web`
- [x] `corepack pnpm e2e:demo-web:browser`
- [x] 9901 `/` 与 `/api/health` 可访问，且 9901 HTML 与 `apps/demo-web/dist/index.html` 引用真实 dist bundle。

## Completion Notes

- Browser E2E passed through Chrome CDP fallback because Playwright is not installed in this workspace; if both Playwright and Chrome are unavailable, the script returns `browserE2E=blocked`.
- `vendor-arco-Dt6qxrmd.js` remains 517.22 kB after minification. This is a remaining performance item; the plan intentionally keeps Arco in one chunk to avoid circular manual chunk warnings.
- Real external OCR/LLM/LIMS sandbox, real KMS/Vault/Secret Manager, and persistent multi-instance queue/broker remain blocked/remaining.
