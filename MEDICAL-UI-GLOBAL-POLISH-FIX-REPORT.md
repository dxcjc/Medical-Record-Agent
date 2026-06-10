# Medical UI Global Polish Fix Report

生成时间：2026-06-09 CST

## 修复范围

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行。项目根目录未找到 `CLAUDE.md`，已读取历史报告引用的 `/tmp/arrow-dealer-system/CLAUDE.md` 并按 superpowers 流程落盘计划：

- `docs/superpowers/plans/2026-06-09-ui-global-polish.md`

本轮增量修改：

- `apps/demo-web/src/styles.css`
- `apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/ui-arco-style-guards.test.ts`

## 关键修复点

1. 宽屏容器利用率
   - `--page-max-width` 从 1440px 提升到 1600px。
   - `workspace-main/u-container` 使用 `min(calc(100vw - 48px), var(--page-max-width))`，宽屏更充分利用空间但不贴边。
   - 1440px+ 增加 32px 页面留白与更合理 dashboard/provider grid。

2. 最近任务表格
   - 最近任务首列改为 `recent-task-cell`，任务名、记录号、创建时间分层展示。
   - 模板列增加模板名 + Adapter 层级，Provider 列使用 mono pill，负责人列增加负载语义。
   - 设置列宽和 `scroll={{ x: 1120 }}`，保持表格清晰横滚，避免关键列拥挤。

3. 顶部按钮区与移动端
   - 守卫 `.page-header__actions`、`.toolbar` 按钮在移动端 `flex: 1 1 152px`，触摸区保持 44px。
   - 保留中屏 topbar 次要信息隐藏策略，避免按钮/标签挤压标题。

4. 指标卡片与 grid
   - `metric-grid` 改为 `repeat(auto-fit, minmax(240px, 1fr))`。
   - compact grid 改为 `minmax(200px, 1fr)`，降低中宽半截卡片风险。
   - `dashboard-grid/operations-split` 使用更稳的左右比例和最小列宽。

5. 隐私选项
   - 新建识别页隐私 checkbox 从简单堆叠升级为企业设置项：图标、标题、说明、启用状态和清晰边界。
   - 保留 Arco `Checkbox` 语义和可访问标签。
   - 移动端隐私项切为单列，避免说明文字或状态 pill 溢出。

6. 全局一致性
   - 沿用 Material + Arco Design：白侧栏、pill 高亮、`#3370FF`、`#F7F8FA`、DM Sans + Noto Sans SC、8px 卡片圆角和克制阴影。
   - 没有回滚旧红色主题，没有整体重写 CSS。

## 巡检覆盖

源码/样式守卫覆盖页面：

- Login
- Recognition Dashboard
- New Recognition
- Job Detail
- Schema Studio
- Evaluation
- Provider Settings
- Writeback
- Feedback Samples
- Agent Trace
- Audit Log
- Dataset Spec
- NotFound

本轮重点实改看板、最近任务表格、新建识别隐私项和全局 CSS。Schema/Evaluation/Operations 等页面继续由统一 `.app-page`、`.panel`、`.metric-grid`、`.form-grid`、`.table-scroll`、`.page-header__actions` 规则兜底。

## 测试结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | 通过。shared/core/demo-web/api/scripts typecheck 均完成。 |
| `corepack pnpm test` | 通过。67 个 test files passed、1 skipped；367 tests passed、1 skipped。存在既有 Node `DEP0040 punycode` warning。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过。18 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过。5 passed、13 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过。Vite production build 成功。 |
| `corepack pnpm smoke:demo-web` | 通过。`mode=mock-runtime`，检查 `/login`、`/`、`/recognition/new`、`/recognition/jobs/demo`、`/providers`、`/writeback`，`apiHealthOk=true`、`distBundleOk=true`。 |
| `corepack pnpm e2e:demo-web:browser` | 通过。`browserE2E=passed`，`engine=chrome-cdp`。 |

补充说明：尝试用 `DEMO_WEB_BROWSER_E2E_ROUTES='/login,/,/recognition/new,/recognition/jobs/demo,/providers,/writeback,/schema,/evaluation'` 扩展浏览器脚本时，在 `/schema` 失败，失败原因是现有脚本 `routeTextOk` 白名单只覆盖默认 6 条路由，不是页面渲染崩溃。最终按仓库默认支持路由完成真实浏览器截图验收。

## 真实运行验证

- `apps/demo-web/dist/index.html` 当前引用：
  - `/assets/index-Cc7F_kDe.js`
  - `/assets/index-CzYImV27.css`
- `http://127.0.0.1:9901/` 可访问，返回 HTML 与当前 dist 引用资产一致。
- `http://127.0.0.1:9901/api/health` 返回 `{"status":"ok","service":"medical-record-agent-api"}`。

## 截图路径

浏览器 E2E 截图目录：`ui-parity-screenshots/medical-e2e-current/`

- `desktop-home.png`
- `desktop-login.png`
- `desktop-recognition-new.png`
- `desktop-recognition-jobs-demo.png`
- `desktop-providers.png`
- `desktop-writeback.png`
- `mobile-home.png`
- `mobile-login.png`
- `mobile-recognition-new.png`
- `mobile-recognition-jobs-demo.png`
- `mobile-providers.png`
- `mobile-writeback.png`

这些截图覆盖桌面首页/识别看板、新建识别、Provider 设置、写回页面，以及移动端首页/识别看板/隐私选项相关页面。

## 剩余风险

- 浏览器 E2E 默认脚本未内置 `/schema`、`/evaluation` 的 route text 断言，无法直接用同一脚本扩展截图验收这两页；本轮通过源码巡检和全局样式守卫覆盖。
- 全量测试仍有既有 `punycode` deprecation warning，不影响本轮 UI 验收。
- UI 当前阶段通过不代表真实 OCR/LLM/LIMS 外部集成最终完成；外部集成仍需按生产 smoke 和真实 sandbox 环境单独验收。

