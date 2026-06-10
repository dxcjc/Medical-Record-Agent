# 2026-06-09 UI Global Polish

## Brainstorming

本轮目标不是修一个红框，而是把截图暴露的问题升级为 demo-web 全局 UI 巡检和修复闭环。项目根目录未找到 `CLAUDE.md`，已读取历史报告引用的 `/tmp/arrow-dealer-system/CLAUDE.md`，并按其中 superpowers 要求执行：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

已参考资料：
- `PRODUCT-AUDIT-REPORT.md`
- `MEDICAL-ARCO-UI-AUDIT-REPORT.md`
- `MEDICAL-UI-REFLOW-FIX-REPORT.md`
- `apps/demo-web/src/styles.css`
- `apps/demo-web/src/layouts/AppShell.tsx`
- `apps/demo-web/src/pages/recognition/RecognitionDashboardPage.tsx`
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx`
- `apps/demo-web/src/pages/operations/WritebackPage.tsx`
- `apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`
- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx`

截图输入：
- `/home/ubuntu/.hermes/image_cache/img_367bda702f9e.jpg`：最近任务表格首列/模板区域弱设计，信息层级和对齐不足。
- `/home/ubuntu/.hermes/image_cache/img_069b092954c5.jpg`：看板上半屏按钮/卡片区存在截断或拥挤风险。
- `/home/ubuntu/.hermes/image_cache/img_6b475fee7a46.jpg`：宽屏左右空白过大，page shell 与 content max-width 没有充分利用宽屏。
- `/home/ubuntu/.hermes/image_cache/img_321f976b9b75.jpg`：隐私 checkbox 原生感强，与 Material + Arco 企业设置风格不统一。

全局问题归纳：
- 宽屏：`--page-max-width` 和 dashboard grid 对 1440px+ 的利用偏保守，页面像被限制在窄容器里。
- 表格：全局 `white-space: nowrap` 保护了横滚，但最近任务关键列没有业务化 cell，任务名、记录号、模板、Provider、状态和写回的层级不够。
- 操作区：`.page-header__actions` 能 wrap，但按钮 min width、移动端换行和中屏可读性还需要更明确的守卫。
- 卡片 grid：metric/dashboard/provider/operations grid 需要用更稳的 `minmax()`，避免中宽某个卡片露半截或撑破。
- 隐私/合规：新建识别隐私选项需要从普通 checkbox 列表升级为设置项，包含图标、标题、说明、状态和可信视觉边界。
- 全局一致性：Schema、Evaluation、Provider、Writeback、表单、表格、payload、空/错误状态继续沿用现有 Arco + Material token，不引入旧红色主题，不整体重写 CSS。

## Writing Plans

1. 增加测试守卫：
   - `ui-arco-style-guards.test.ts` 加宽屏容器、dashboard grid、metric grid、最近任务业务 cell、隐私设置项、移动端 action wrap 和触摸区断言。
   - 保持 `test:styles` 与 `test:mobile` 都能直接覆盖本轮 UI 规则。

2. 增量实现：
   - `styles.css`：将 `--page-max-width` 调整到更合理的宽屏值；补宽屏/桌面/移动布局规则；新增 recent job/table、privacy option、table cell wrapping、action/button 稳定尺寸样式。
   - `RecognitionDashboardPage.tsx`：最近任务列增加业务 cell class、列宽、模板/Provider/负责人层级；表格横滚宽度提高到能容纳真实医疗任务字段。
   - `NewRecognitionPage.tsx`：隐私 checkbox 改为企业级设置项，保留 Arco `Checkbox` 可访问语义与状态说明。
   - 必要时同步 browser e2e 截图覆盖，不扩大到无关 API 行为。

3. 巡检覆盖页面：
   - Shell / topbar / sidebar：容器利用、按钮不截断、移动抽屉。
   - Recognition Dashboard：指标卡、最近任务表格、Provider/写回卡片。
   - New Recognition：上传、配置、隐私、按钮区。
   - Provider Settings：Provider 列表、表单、健康检查。
   - Writeback：加载表单、候选表格、条件检查、payload。
   - Schema Studio / Evaluation：指标、表格、表单、危险动作/错误状态。
   - 其它 Operations 页面按全局 class 兜底检查。

## TDD / 测试计划

先补静态守卫，再实现：
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`

完整验证命令：
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm smoke:demo-web`
- `corepack pnpm e2e:demo-web:browser`

真实运行验证：
- 确认 `apps/demo-web/dist/index.html` 引用新 bundle。
- 检查 9901 或当前预览端口首页可访问。
- 截图至少覆盖桌面首页/识别看板/新建识别/Provider 设置/写回页面，以及移动端首页/识别看板/隐私选项相关页面。

## Verification

验收时记录：
- 所有必跑命令状态和关键输出。
- 浏览器 E2E 截图目录和具体截图路径。
- dist bundle 文件名与 9901 返回 HTML 是否一致。
- UI 当前阶段是否通过。
- 医疗项目整体是否仍存在 OCR/LLM/LIMS/生产外部集成 blocked，不能把 UI 通过写成医疗项目最终完成。

