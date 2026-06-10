# Medical Open Design UI Supplemental Audit Report

生成时间：2026-06-09 CST

## 问题说明

前一轮 `ui-parity-screenshots/medical-e2e-current/mobile-recognition-new.png` 证据不足：截图处于移动端侧边栏 Drawer 展开状态，主体的新建识别表单、隐私选项、按钮和卡片被遮挡，不能证明 390x844 主体布局合格。

根因是 `scripts/demo-web-browser-e2e.ts` 的 `assertMobileLayout` 会点击“打开导航菜单”验证移动端 Drawer，但截图前没有关闭 Drawer，也没有检查遮罩是否退出。因此 E2E 自身把页面置于抽屉展开状态后直接截图。

## 处理方式

- 修复 `scripts/demo-web-browser-e2e.ts`：
  - 移动端验证 Drawer 后调用 `closeMobileDrawerForScreenshot`，等待导航抽屉和遮罩关闭。
  - 新增通用 `findVisibleViewportOverlay` 检查，防止 Drawer mask 动画残留或其它全屏 overlay 污染截图。
  - 新增 `assertMainContentReadyForScreenshot`，对 `/recognition/new` 和 `/` 检查主体可见、无横向溢出、关键卡片不超宽、隐私项/checkbox/按钮触摸区达标。
  - 移动截图使用 full page，便于同一证据覆盖上传、表单、隐私选项和操作按钮。
- 补充 `scripts/demo-web-browser-e2e.test.ts` 契约测试，防止后续回退到“打开 Drawer 后直接截图”。
- 小范围修复 `NewRecognitionPage.tsx` 和 `styles.css`：隐私项整行可点击，`.privacy-option__checkbox` 具备 44px 触摸目标；未重写 CSS，未改后端契约。

## 截图证据

最终补充截图已重新生成：

- 移动端新建识别主体页：`ui-parity-screenshots/medical-e2e-current/mobile-recognition-new.png`
- 移动端识别看板/最近任务主体页：`ui-parity-screenshots/medical-e2e-current/mobile-home.png`

两张截图均为 390x844 逻辑视口、device scale factor 2 的全页 PNG：`mobile-recognition-new.png` 为 780x5040，`mobile-home.png` 为 780x7440。人工复核未见侧边栏 Drawer 或遮罩遮挡。

## 1. 产品概述

Medical Record Agent demo-web 是面向病历识别、结构化抽取、证据复核、Provider 运维和写回控制的医疗 AI 工作台。本轮只补充 UI 显示优化阶段验收，不判定医疗项目整体上线完成。

## 2. 功能完整性

识别看板、新建识别、Provider、写回等入口保留。新建识别页的上传区、Schema/Adapter/Provider 表单、隐私选项和主要操作按钮在移动截图中均可见且未被抽屉遮挡。

## 3. 业务流程完整性

上传病历 -> 选择配置 -> 设置隐私策略 -> 创建识别任务 -> 看板查看最近任务的流程未改变。脚本修复只改变截图前的浏览器状态清理和断言，不影响业务 API、DTO 或后端契约。

## 4. 用户体验

390x844 移动端复核通过：无横向页面溢出；隐私选项完整可见；按钮高度不小于 44px；checkbox 触摸 wrapper 不小于 44px；表单、卡片和最近任务列表没有被 Drawer 或遮罩覆盖。

## 5. 技术实现

本轮采用测试优先和小范围 patch：

- `scripts/demo-web-browser-e2e.test.ts` 增加截图脚本契约守卫。
- `scripts/demo-web-browser-e2e.ts` 增加 Drawer 关闭、overlay 检测、主体布局断言。
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx` 和 `apps/demo-web/src/styles.css` 只补强隐私项触摸区。
- `apps/demo-web/src/ui-arco-style-guards.test.ts` 同步守卫 44px 触摸目标。

## 6. 问题清单 P0/P1/P2

P0：未发现阻塞。最终移动主体截图无抽屉/遮罩遮挡，指定测试、构建、E2E、9901 检查均通过。

P1：已修复移动端截图脚本污染页面状态的问题；已修复隐私 checkbox 触摸区证据不足风险。

P2：移动 PNG 为 2x 缩放全页图，尺寸大于 390x844 属于浏览器 device scale factor 和 full page 截图结果；真实 OCR/LLM/LIMS、生产多实例和外部 sandbox 不在本 UI 显示优化阶段验收范围内。

## 7. 验收结论

Open Design UI 显示优化阶段：通过。

验证依据：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，19 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，生成 `index-9cuUF0bK.js`、`index-CyVDmtFL.css`。
- `corepack pnpm e2e:demo-web:browser`：通过，`browserE2E=passed`、`engine=chrome-cdp`。
- `http://127.0.0.1:9901/` 与 `apps/demo-web/dist/index.html` 一致，加载新 bundle。
- `http://127.0.0.1:9901/api/health` 返回 `{"status":"ok","service":"medical-record-agent-api"}`。

医疗项目整体最终上线判定不在本报告范围内。
