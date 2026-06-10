# 2026-06-09 P2 E2E/UI/Perf Local Closure Plan

> 本计划按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

## Brainstorming

当前 UI 阶段已通过，上一阶段 mock-runtime smoke、基础 9901 访问和构建也已通过，但医疗项目最终产品仍未完成。剩余项中，本轮优先本地闭环：

- 真实浏览器 E2E 能力：覆盖登录、首页 Shell、关键业务路由和移动端导航抽屉；浏览器不可用时必须输出 `browserE2E=blocked` 和原因。
- UI 增量细节：继续守护 AppShell、页面头部、卡片、表格、表单和移动端触摸区，避免侧栏遮挡、顶部换行溢出、表格横滚失效。
- 打包体积：保留路由懒加载和单一 `vendor-arco`，避免恢复 Arco 细拆导致 circular warning；复查 build 最大 chunk。
- 产品化交接：真实外部 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例持久化可靠队列保持 remaining/blocked 语义，整理部署方需要的配置和 CI 参数。

本轮不能伪造完成：

- 真实外部 OCR/LLM/LIMS sandbox smoke。
- 真实 KMS/Vault/Secret Manager。
- 多实例 broker/lease/retry/dead-letter 可靠队列。

## TDD Tasks

- [x] 读取既有报告、计划和 handoff，确认 UI 阶段通过但最终产品仍不通过。
- [x] 先增强 `scripts/demo-web-browser-e2e.test.ts`，守护 `passed/blocked` 汇总、截图目录、关键路由、Playwright/Chrome CDP 同等页面断言、移动抽屉断言和 browser unavailable blocked 语义。
- [x] 保持/增强 `apps/demo-web/src/ui-arco-style-guards.test.ts` 与 `apps/demo-web/src/viteChunking.test.ts`，防止 UI spacing/overflow/mobile/table/chunk 回退。
- [x] 保持/增强 handoff 文档测试，确认真实 sandbox/KMS/可靠队列仍是 remaining/blocked。

## Implementation Tasks

- [x] 调整 `scripts/demo-web-browser-e2e.ts`，让 Playwright 分支和 Chrome CDP 分支使用同等关键路由与移动布局断言，并在浏览器依赖不可用时输出 blocked。
- [x] 小范围更新 CSS/组件 class，仅补充溢出、横滚、触摸区和布局守护所需规则。
- [x] 复查 Vite chunk 策略；不恢复 Arco 子 chunk，不提高 chunk warning 阈值。
- [x] 更新 README/handoff 和最终报告，明确本轮阶段通过与最终产品不通过的边界。

## Verification

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`
- [x] `corepack pnpm smoke:demo-web`
- [x] `corepack pnpm e2e:demo-web:browser`
- [x] 9901 `/` 与 `/api/health` 可访问，且 9901 HTML 与 `apps/demo-web/dist/index.html` 引用真实 dist bundle。
