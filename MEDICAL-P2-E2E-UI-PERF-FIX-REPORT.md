# Medical P2 E2E/UI/Perf Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

## Superpowers 流程记录

已执行 `brainstorming`：当前 UI 阶段已通过，上一阶段 typecheck/test/demo-web styles/mobile/build、9901 基础访问和 mock-runtime smoke 已通过，但项目最终产品仍未完成。本轮梳理后优先处理可在本地闭环的 P2：真实浏览器 E2E/截图、UI 细节 guard、打包体积安全复查、生产化交接；真实外部 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例持久化可靠队列保持 blocked/remaining。

已执行 `writing-plans`：新增 `docs/superpowers/plans/2026-06-09-p2-e2e-ui-perf-local-closure.md`，并将 TDD、实现和验证步骤逐项标记完成。

已执行 `TDD/测试优先`：
- 先增强 `scripts/demo-web-browser-e2e.test.ts`，运行后红灯：Playwright 分支未复用关键路由/移动抽屉断言，浏览器不可用缺少 blocked 文案。
- 实现 `scripts/demo-web-browser-e2e.ts` 后重跑定向测试转绿。
- 先增强 `apps/demo-web/src/ui-arco-style-guards.test.ts`，运行后红灯：页面头部输入/选择器与 action row 缺少新增 overflow/touch guard。
- 增量补充 `apps/demo-web/src/styles.css` 后重跑 styles guard 转绿。

已执行 `verification-before-completion`：完成用户指定验证命令、真实浏览器 E2E、9901 首页/API health 和 dist bundle 对比。

## 本轮修复点

- `scripts/demo-web-browser-e2e.ts`
  - 增加真实浏览器 E2E 能力，优先 Playwright，未安装时使用系统 Chrome CDP。
  - Playwright 与 Chrome CDP 分支现在共享同等断言：路由 ready、登录页、AppShell、主内容、关键路由文案、横向溢出、移动端侧栏隐藏、44px 菜单按钮、移动抽屉导航。
  - 浏览器不可用时输出 `browserE2E: "blocked"` 和原因；可运行时输出 `browserE2E: "passed"`。
  - 截图保存到 `ui-parity-screenshots/medical-e2e-current/`。

- `scripts/demo-web-browser-e2e.test.ts`
  - 守护默认覆盖路由、截图命名、passed/blocked 分类、Playwright/CDP 同等断言、浏览器不可用 blocked 语义。

- `apps/demo-web/src/ui-arco-style-guards.test.ts`
  - 增强移动端和布局 guard，覆盖页面头部输入/选择器 max-width、action row 可换行、桌面 40px/移动 44px 触摸区、form control wrapper `min-width: 0`。

- `apps/demo-web/src/styles.css`
  - 小范围补充 `.page-header__actions`、`.toolbar`、`.row-actions` 和 `.arco-form-item-control-wrapper` 的 overflow/touch 规则。
  - 未重写设计系统，保持 Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉/单列/44px 触摸区。

- `docs/superpowers/plans/2026-06-09-p2-e2e-ui-perf-local-closure.md`
  - 新增本轮 superpowers 计划并记录完成状态。

## 打包复查

`corepack pnpm --filter @medical-record-agent/demo-web build` 通过，但 `vendor-arco-Dt6qxrmd.js` 为 517.22 kB，仍超过 500 kB 并触发 Vite chunk warning。当前最大 chunk：

- `vendor-arco-Dt6qxrmd.js`：517.22 kB，gzip 146.58 kB。
- `vendor-core-Bjp6EC4w.js`：421.63 kB，gzip 136.61 kB。
- `vendor-arco-DC-V527f.css`：570.61 kB，gzip 64.04 kB。

未恢复 Arco 子 chunk 细拆，原因是既有 `apps/demo-web/src/viteChunking.test.ts` 和历史报告已明确：细拆 Arco 内部 Table/Form/Trigger/_util 等模块会带回 Rollup circular manual chunk warning。当前保留单一 `vendor-arco` 和路由 lazy loading，不提高 `chunkSizeWarningLimit`，不把 warning 隐藏成通过。

后续安全策略：评估 Arco 组件按需入口迁移、替换少量重量组件、CSS 按需加载或使用 Arco build 插件；每一步必须保留 circular warning 回归测试。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，65 passed、1 skipped；326 passed、1 skipped。仍有 Node `DEP0040 punycode` warning，数据库集成测试按设计 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，但 `vendor-arco` 517.22 kB 仍触发 500 kB warning。
- `corepack pnpm smoke:demo-web`：通过，`mode: mock-runtime`、`browserE2E: not-run`、6 条关键路由、9901 API health 和 dist bundle 检查均 ok。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E: passed`、`engine: chrome-cdp`。

浏览器 E2E 覆盖：
- 路由：`/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`。
- 截图：`desktop-login.png`、`desktop-home.png`、`desktop-recognition-new.png`、`desktop-recognition-jobs-demo.png`、`desktop-providers.png`、`desktop-writeback.png`、`mobile-login.png`、`mobile-home.png`、`mobile-recognition-new.png`、`mobile-recognition-jobs-demo.png`、`mobile-providers.png`、`mobile-writeback.png`。
- 目录：`ui-parity-screenshots/medical-e2e-current/`。

9901 验证：
- `curl -i --max-time 10 http://localhost:9901/`：200 OK。
- `curl -i --max-time 10 http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 返回 HTML diff 为空。
- HTML 引用真实 dist bundle：`/assets/index-D2GU2DyK.js`、`vendor-core-Bjp6EC4w.js`、`vendor-arco-Dt6qxrmd.js`、`vendor-interaction-5eOltMzJ.js`。

## 剩余 blocked/remaining

- 真实外部 OCR/LLM/LIMS sandbox smoke：remaining/blocked，缺少部署方真实 sandbox 和 `PRODUCTION_SMOKE_MODE=real-sandbox` 配置。
- 真实 KMS/Vault/Secret Manager：remaining/blocked，当前只能声明 env resolver contract 可用，不能声明真实 KMS 已接入。
- 多实例持久化可靠队列：remaining/blocked，当前仍是进程内最小闭环，不满足 broker、lease、retry、dead-letter、worker heartbeat 和多副本一致性。
- vendor-arco JS 低于 500 kB：remaining，当前 517.22 kB；本轮只完成安全复查和防回退，没有伪造完全解决。

## 验收结论

UI 当前阶段：继续通过。

本轮 P2 E2E/UI 细节/性能复查/交接阶段：通过。真实浏览器 E2E 已通过，UI 增量 guard 已通过，打包策略防回退已通过，生产化交接保持 blocked/remaining 语义。

医疗项目最终产品：不通过。真实外部 sandbox、生产 KMS/Vault/Secret Manager、多实例持久化可靠队列仍未闭环，vendor-arco 体积仍有 remaining。
