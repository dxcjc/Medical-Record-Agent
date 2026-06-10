# Medical Open Design UI Supplemental Audit Plan

生成时间：2026-06-09 CST

## Brainstorming

- 已读取 `MEDICAL-OPEN-DESIGN-UI-FIX-REPORT.md`、`MEDICAL-OPEN-DESIGN-UI-AUDIT-REPORT.md` 和 `docs/superpowers/plans/2026-06-09-medical-open-design-ui-polish.md`。
- 二次视觉验收指出 `ui-parity-screenshots/medical-e2e-current/mobile-recognition-new.png` 处于移动端侧边栏抽屉展开状态，主体表单、隐私选项、按钮和卡片被遮挡，不能作为主体布局验收证据。
- 初步定位到浏览器 E2E 的移动端布局断言会点击“打开导航菜单”验证 Drawer，但截图前没有关闭 Drawer，导致截图状态被断言步骤污染。
- 本轮只补充截图脚本和验收报告；不重写 CSS、不修改后端业务契约、不提交 git commit。

## Writing Plans

- [x] TDD/测试优先：补充 `scripts/demo-web-browser-e2e.test.ts`，要求移动端断言关闭导航抽屉，并在截图前验证主体内容未被抽屉遮挡。
- [x] 实现：修复 `scripts/demo-web-browser-e2e.ts`，移动端打开抽屉验证后关闭并等待消失；对 `/recognition/new` 和 `/` 增加主体可见检查。
- [x] 截图：重新生成 `mobile-recognition-new.png` 和 `mobile-home.png`，必要时保留同轮其它 E2E 截图。
- [x] 390x844 验收：检查无横向溢出、隐私选项可见、按钮/checkbox 触摸区足够、表单和卡片不遮挡。

## Verification Before Completion

- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 tests passed。
- [x] `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- [x] `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，生成 `index-Bzt7jj6t.js`、`index-DRynfI52.css` 等新 bundle。
- [x] `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`。
- [x] 检查 `http://127.0.0.1:9901/` 可加载新 bundle，`/api/health` 返回 ok；9901 首页与 `apps/demo-web/dist/index.html` 一致。
- [x] 生成 `MEDICAL-OPEN-DESIGN-UI-SUPPLEMENTAL-AUDIT-REPORT.md`，只判断 UI 显示优化阶段。
