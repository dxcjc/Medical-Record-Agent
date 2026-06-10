# Medical P2 E2E/UI/Perf Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖文件上传、OCR/LLM 编排、Schema 版本、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维和审计。

本轮审计重点是 P2 E2E/UI 细节/打包性能/生产化交接，不把前序 UI 阶段通过误判为最终产品完成。

## 2. 功能完整性

本轮已补齐：

- 真实浏览器 E2E 能力：`pnpm e2e:demo-web:browser` 可运行 Chrome CDP，输出 `browserE2E=passed`。
- 浏览器不可用语义：脚本保留 `browserE2E=blocked` 和原因，不以 mock-runtime 冒充真实浏览器。
- 路由覆盖：`/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 移动端覆盖：检查桌面侧栏隐藏、移动菜单按钮 44px、导航抽屉可打开。
- 截图保存：12 张桌面/移动截图写入 `ui-parity-screenshots/medical-e2e-current/`。
- UI guard：新增/保持侧栏不遮挡、header 防溢出、表格横滚、按钮触摸区和表单控件不挤出容器的守护。
- 交接文档：`README.md` 和 `docs/2026-06-09-p2-production-handoff.md` 继续明确真实 sandbox/KMS/可靠队列 remaining/blocked。

仍未完整：

- 真实外部 OCR/LLM/LIMS sandbox smoke。
- 真实 KMS/Vault/Secret Manager。
- 多实例持久化可靠队列。
- `vendor-arco` JS 低于 500 kB。

## 3. 业务流程完整性

本地 demo-web 验收流程：

- 本地 Vite 启动后检查登录页和受保护业务路由。
- 对需认证路由注入受控本地 auth state，验证 AppShell、主内容和关键业务文本。
- 移动视口验证 Drawer 导航，而不是只访问 HTML。
- 通过时生成截图；不可运行浏览器时输出 blocked。

生产 smoke 交接流程：

- `mock-production` 只能代表本地 contract smoke。
- `real-sandbox` 必须由部署方提供真实 `PRODUCTION_SMOKE_*`、OCR/LLM/LIMS provider 和可写回 sandbox。
- 写回只能基于服务端结果中的 `payload.writeback.readyFields`。

业务结论：本轮本地前端 E2E 和交接语义闭环；真实外部业务集成未闭环。

## 4. 用户体验

当前 UI 继续保持 Material + Arco Design 企业级风格：

- Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill。
- `DM Sans + Noto Sans SC` 字体。
- 桌面 Shell 在 grid flow 中，侧栏 sticky 但不 fixed 覆盖主内容。
- 平板/移动隐藏次要 topbar 信息，避免标题和 breadcrumb 挤压换行。
- 移动端抽屉导航、单列布局、44px 触摸区。
- 表格和 Arco table 内容保留横向滚动。

本轮只做小范围增量 CSS：页面头部输入/选择器 max-width、toolbar/action row 按钮 min-height、移动端 form control wrapper `min-width: 0`。未重写主题或页面结构。

## 5. 技术实现

关键文件：

- `scripts/demo-web-browser-e2e.ts`
  - Playwright 优先，Chrome CDP fallback。
  - 共用 `waitForRouteReady()`、`assertRoute()`、`assertMobileLayout()`。
  - 输出 `passed/blocked` 结构化 JSON。

- `scripts/demo-web-browser-e2e.test.ts`
  - 守护覆盖路由、截图命名、状态分类、Playwright/CDP 同等断言、浏览器不可用 blocked。

- `apps/demo-web/src/ui-arco-style-guards.test.ts`
  - 守护企业级 UI token、Shell、tablet 截断、上传区间距、表格横滚、移动触摸区。

- `apps/demo-web/src/styles.css`
  - 增量 overflow/touch guard。

- `apps/demo-web/vite.config.ts` 与 `apps/demo-web/src/viteChunking.test.ts`
  - 保持单一 `vendor-arco`，防止恢复有问题的 Arco 子 chunk。
  - 不提高 `chunkSizeWarningLimit`。

## 6. P0/P1/P2 问题清单

P0：
- 未发现当前阻断 typecheck、全量测试、demo-web build、9901 首页/API health 的 P0。

P1：
- 真实浏览器 E2E 已从未运行提升为本地通过：`browserE2E=passed`、`engine=chrome-cdp`。
- UI 当前阶段继续通过，未破坏 Material + Arco Design。
- 真实 production sandbox 仍 remaining/blocked，不能写产品最终通过。

P2 已闭环：
- P2-1 真实浏览器 E2E/移动端截图验收能力：通过。
- P2-2 UI 细节增量巡检与 guard：通过。
- P2-4 产品化交接：通过，真实外部项保持 remaining/blocked。

P2 remaining：
- P2-3 vendor chunk：`vendor-arco-Dt6qxrmd.js` 517.22 kB，仍超过 500 kB。当前安全策略不恢复 Arco 子 chunk 细拆，因为会带回 circular warning 风险；后续需按需入口、组件替换或 CSS 按需加载专项处理。
- 真实 KMS/Vault/Secret Manager、真实 OCR/LLM/LIMS sandbox、多实例持久化可靠队列仍未完成。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；326 passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，但 `vendor-arco` 517.22 kB 触发 Vite 500 kB warning。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`browserE2E=not-run`。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`。
- 9901 `/`：200 OK。
- 9901 `/api/health`：200 OK。
- 9901 HTML 与 `apps/demo-web/dist/index.html` diff 为空。

分层结论：

- UI 当前阶段是否继续通过：通过。
- 本轮 P2 E2E/UI 细节/性能/交接阶段是否通过：通过；性能项中 vendor-arco 体积仍 remaining，但已完成安全复查和防回退。
- 医疗项目最终产品是否通过：不通过。真实外部 sandbox、生产 KMS/Vault/Secret Manager、多实例持久化可靠队列仍未闭环，且 vendor-arco 低于 500 kB 仍未安全完成。
