# 2026-06-09 P2 Production Closure Plan

> 本计划按 superpowers 流程执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

## Brainstorming

最新审计报告确认 UI 当前阶段和本地 P2 E2E/UI/交接阶段已通过，但医疗项目最终产品仍不通过。remaining 中可工程化推进的部分分为三类：

- demo-web bundle：`vendor-arco` JS 517.22 kB 超过 Vite 500 kB warning。安全方向是保留路由懒加载、保持单一 `vendor-arco` manual chunk 避免 Arco 子 chunk circular warning，并通过构建期 Arco 按需入口减少进入 chunk 的模块；不提高 `chunkSizeWarningLimit`。
- 生产化契约：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例持久化队列没有外部凭据和 broker。代码侧补齐 resolver/queue 配置契约和 fail-fast 测试；报告中保持 external credential blocked。
- UI regression：继续保持 Material + Arco Design 现有风格，补移动端横滚、触摸区、表单最小宽度和遮挡 guard。

## TDD Tasks

- [x] 新增/增强 demo-web chunk 测试：构建期 alias 必须指向按需 Arco 入口，不能提高 `chunkSizeWarningLimit`，不能恢复 Arco 子 chunk，不能从 `App.tsx` 顶层导入全量 Arco barrel。
- [x] 新增生产化测试：secret resolver 支持必须存在、缺失密钥不能伪成功；queue contract 必须明确 `in-process` 非多实例，`broker` 缺 URL/lease/retry/DLQ 时 fail-fast。
- [x] 新增 smoke 测试：真实 sandbox 缺外部凭据时输出 blocked，不把 mock-production 写成真实通过。
- [x] 增强 UI style guard：移动端页面头部 action 横滚、行内按钮 44px 触摸区、表单 wrapper `min-width: 0` 必须保留。

## Implementation Tasks

- [x] 新增 `apps/demo-web/src/vendor/arco-on-demand.ts`，只 re-export 当前源码实际使用的 Arco 组件深入口和必要类型。
- [x] 更新 `apps/demo-web/vite.config.ts`，用 exact alias 把 `@arco-design/web-react` 指向按需入口；保留单一 `vendor-arco` manual chunk 和 9901/API proxy 无关配置。
- [x] 更新生产服务 bootstrap，补 queue production contract 解析/校验并导出给测试和文档。
- [x] 小范围补 CSS，维护 Material + Arco Design token、active nav pill、移动抽屉/单列/44px 触摸区。
- [x] 更新 README/handoff 和新增两份报告，明确阶段通过和最终产品不通过的分层结论。

## Verification

- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`
- [x] `corepack pnpm smoke:demo-web`
- [x] `corepack pnpm e2e:demo-web:browser`，浏览器不可用时记录 `browserE2E=blocked`
