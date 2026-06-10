# 医疗项目 Arco UI 全局审计报告

生成时间：2026-06-09 CST

## 1. 产品概述

`apps/demo-web` 已从早期自写 demo 风格统一为 Material + Arco Design 的医疗 AI 企业工作台。系统覆盖病历识别、任务详情、Schema 管理、评测中心、反馈样本、Provider 设置、写回控制、Agent Trace、审计日志和数据集规范。

当前设计系统保持：
- Primary `#3370FF`。
- 页面背景 `#F7F8FA`。
- 白色侧栏、active nav pill、顶部面包屑和全局搜索。
- `DM Sans + Noto Sans SC` 字体。
- 移动端抽屉导航、单列布局、横向表格滚动和 44px 触摸区。

## 2. 功能完整性

已使用 Arco Design 的页面和模块：
- AppShell：`Button`、`Input.Search`、`Badge`、`Avatar`、`Breadcrumb`、`Drawer`、`Tag`、`Tooltip`、`Card`。
- LoginPage：`Card`、`Form`、`Input`、`Button`、`Checkbox`、`Alert`、`Tag`。
- Recognition：看板、新建识别、任务详情使用 `Card`、`Table`、`Button`、`Select`、`Form`、`Alert`、`Tag`、`Checkbox`。
- Schema Studio：Schema 列表、版本列表、草稿编辑、验证、发布流、版本比较使用 `Card`、`Table`、`Input`、`Select`、`Button`、`Alert`、`Tag`。
- Evaluation：数据集列表、样本导入、Run 创建、指标卡、版本对比使用 `Card`、`Table`、`Form`、`Input`、`Select`、`Checkbox`、`Button`、`Alert`、`Tag`。
- Operations/Settings：Feedback、Writeback、Provider Settings、Agent Trace、Audit Log 使用 `Card`、`Table`、`Modal`、`Alert`、`Timeline`、`Input`、`Select`、`Switch`、`Button`、`Tag`。
- Misc：NotFound、Dataset Spec 使用 `Card`、`Button`、`Tag`。

本轮补齐：
- 路由级 lazy loading。
- 可访问路由加载状态。
- skip link、主内容 landmark、全局搜索 label。
- demo-web basic E2E helper 的 URL 和 HTML asset 解析能力。

## 3. 业务流程完整性

已保留原有 API 调用和数据解析函数，没有改变登录、识别任务创建、Schema 发布/校验、评测 Run、反馈入集、写回确认、Provider 保存和健康检查的业务契约。

登录后仍通过 `ProtectedRoute` 进入 AppShell；写回危险动作仍由确认弹窗触发；Schema 发布、停用、回滚仍按权限和后端接口执行；反馈样本入黄金集仍先保存 feedback 再导入 evaluation samples。

9901 部署路径未改变：
- nginx 继续从 `apps/demo-web/dist` 读取前端静态产物。
- `/api/health` 继续代理到 API 服务。
- 本轮未修改 `.env`、API 代理配置或 9901 端口。

## 4. 用户体验

Material + Arco Design 体验保持：
- 页面主体为浅灰背景和白色内容面板，侧栏为白色。
- active nav pill 使用 `#E8F3FF` 背景和 `#3370FF` 文本。
- 卡片、表格、表单、按钮继续使用 Arco 组件和现有 token。
- 字体继续通过 `index.html` 引入 `DM Sans + Noto Sans SC`。
- 移动端 `<1024px` 使用 Drawer 导航，`<768px` 主内容和业务网格单列，可见按钮和表单控件保持不小于 44px。

本轮新增 UX/a11y 改进：
- 键盘用户可通过 skip link 跳到 `#main-content`。
- 全局搜索有 `aria-label="全局页面搜索"`。
- 路由懒加载 fallback 使用 `role="status"` 和 `aria-live="polite"`。
- 路由加载态沿用 `#3370FF` 和 `#F7F8FA`，未引入旧主题。

## 5. 技术实现

关键实现：
- `apps/demo-web/src/App.tsx`
  - 页面组件改为 `React.lazy()`。
  - `RouterProvider` 外层增加 `Suspense`。
  - 保留 `ConfigProvider`、`QueryClientProvider`、`AuthProvider` 和 `ProtectedRoute`。
- `apps/demo-web/vite.config.ts`
  - 增加 `manualChunks`。
  - 分离 `vendor-arco`、`vendor-interaction`、`vendor-core`。
  - 未提高 chunk warning 阈值。
- `scripts/production-smoke.ts`
  - `isCliEntrypoint()` 对 `file://` URL、Windows 盘符和反斜杠路径做归一化。
- `apps/demo-web/src/layouts/AppShell.tsx`
  - 增加 skip link、主内容 id 和全局搜索 label。
- `scripts/demo-web-basic-e2e.ts`
  - 新增基础 E2E helper 和可运行 smoke 入口。
- `apps/demo-web/src/styles.css`
  - 增加 `.route-loading` 和 `.skip-link` 样式，复用既有设计 token。

Build 结果：
- 主入口 JS：`index-gdY3ZDHf.js`，23.69 kB。
- `vendor-core-Bjp6EC4w.js`：421.63 kB。
- `vendor-arco-hrWV4cWL.js`：429.20 kB。
- `vendor-interaction-ByKuiTWU.js`：38.70 kB。
- 页面 chunk 均按路由拆分，未出现主业务 JS 超 500k 警告。

## 6. P0/P1/P2 问题清单

P0：
- 未发现未完成 P0。Arco CSS、ConfigProvider、Shell、登录页、核心页面、移动端和 UI 守护测试均已覆盖。

P1：
- 已修复/确认：`scripts/production-smoke.test.ts > 在 Windows 路径下也能正确判断 CLI 入口模块` 通过。
- 实现点：`scripts/production-smoke.ts` 的入口判断不再直接比较 `pathToFileURL(argvPath).href`，而是统一归一化 module URL 和 argv path。
- 全量 `corepack pnpm test` 已通过，未再出现该失败。

P2：
- 已修复：demo-web build 主业务 JS chunk 超过 500k 的问题。
- 实现点：路由级 lazy loading + Vite `manualChunks`。
- `corepack pnpm --filter @medical-record-agent/demo-web build` 通过，未再输出 `Some chunks are larger than 500 kB`。

剩余非阻塞项：
- 全量测试运行中仍有 Node `DEP0040 punycode` deprecation warning。
- 数据库集成测试 `repositoryDatabase.integration.test.ts` 在当前环境按设计 skipped。
- Arco CSS vendor 文件约 570 kB；这是 CSS 产物，不是本轮 P2 的主 JS chunk 警告。

## 7. 验收结论

验证命令结果：
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，6 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，1 passed、5 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，Vite 完成生产构建，无 500k JS chunk 警告。
- `corepack pnpm test`：通过，61 passed、1 skipped；278 passed、1 skipped。

补充验证：
- `corepack pnpm exec vitest run scripts/production-smoke.test.ts`：通过，7 tests passed。
- `corepack pnpm exec vitest run apps/demo-web/src/a11y/staticA11y.test.ts scripts/demo-web-basic-e2e.test.ts`：通过，4 tests passed。
- `corepack pnpm exec tsc -p tsconfig.scripts.json`：通过。

9901 验证：
- `http://localhost:9901/`：200 OK，返回新 dist HTML。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 和 9901 返回 HTML 均引用 `/assets/index-gdY3ZDHf.js`，确认部署读取新 bundle。

结论：P1 测试稳定性和 P2 chunk 优化已闭环；当前 demo-web 保持 Material + Arco Design 企业级 UI，并且 9901 前端访问和 API 代理可用。
