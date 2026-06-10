# Medical UI Global Polish Audit Report

生成时间：2026-06-09 CST

## 1. 产品概述

Medical Record Agent demo-web 是病历 OCR、结构化抽取、证据复核、Schema 管理、Evaluation、Provider 运维、写回控制和审计追踪的医疗 AI 工作台。当前 UI 方向保持 Material + Arco Design 企业中台风格：白侧栏、active pill、主色 `#3370FF`、灰底 `#F7F8FA`、DM Sans + Noto Sans SC、克制阴影和 8px 卡片圆角。

本轮审计以用户提供 4 张截图为入口，升级为全页面同类问题巡检：宽屏空白、表格信息层级、按钮区截断、指标卡片 grid、隐私/合规设置项、移动端横滚和触摸区。

## 2. 功能完整性

页面承载完整性仍成立：

- 登录：登录表单、demo 凭据控制和安全提示。
- 识别看板：运行状态、业务指标、最近任务、Provider 状态、写回复核概览。
- 新建识别：文件上传、Schema/Adapter/Provider 配置、隐私选项、异步进度、重跑/取消。
- 任务详情：字段、证据、trace、payload、反馈入口。
- Schema Studio：列表、版本、草稿编辑、校验、发布/停用/回滚、比较。
- Evaluation：数据集、样本导入、run 创建、metrics、版本比较。
- Operations：Provider 设置、写回、反馈样本、Agent Trace、审计日志。
- 文档/异常页：数据集规范、NotFound。

本轮未修改业务 API 契约，只增强 UI 表达、响应式布局和守卫测试。

## 3. 业务流程完整性

核心流程仍为：

上传病历 -> 选择 Schema/Adapter/Provider/隐私策略 -> 创建识别 -> 查看任务和证据 -> 人工反馈/评测沉淀 -> 写回控制 -> 审计追踪。

UI 层改进对业务流程的影响：

- 看板最近任务更清楚地区分任务、记录号、模板、Adapter、Provider、状态、置信度、写回和负责人/负载。
- 新建识别隐私选项更像医疗合规设置项，用户能看到每个策略的作用和启用状态。
- 写回和 Provider 页面继承更稳定的 grid、按钮换行、表格横滚规则，降低真实运行时卡片截断和操作区拥挤风险。

业务外部集成状态不因 UI 修复改变：真实 OCR/LLM/LIMS sandbox 和生产外部依赖仍需独立验收。

## 4. 用户体验

已改善：

- 宽屏：页面最大宽度提升到 1600px，1440px+ 视口下主体更充分利用空间，仍保留 32px 留白。
- 表格：最近任务首列和模板列从裸文本升级为业务 cell，视觉层级更接近真实医疗工作台。
- 按钮区：page header 和 toolbar 按钮可 wrap，移动端触摸区保持 44px。
- 指标卡片：`metric-grid` 和 compact grid 使用更合理 `minmax`，避免中宽卡片半截露出。
- 隐私选项：checkbox 列表升级为设置项卡片，包含说明、状态和选中视觉。
- 移动端：侧栏抽屉、单列堆叠、表格横滚、隐私设置项单列、按钮换行均由守卫和截图验证。

视觉抽检结论：桌面看板、新建识别、Provider、写回，以及移动看板/新建识别/Provider/写回没有明显横向溢出、按钮截断或原生 checkbox 堆叠问题。

## 5. 技术实现

实现保持增量：

- `styles.css`
  - `--page-max-width: 1600px`
  - `workspace-main/u-container` 使用宽屏上限和视口留白。
  - 新增 recent job cell、privacy option、grid、mobile action wrap 规则。
  - 保留现有 Arco CSS 和 Material token，没有整体重写。
- `RecognitionDashboardPage.tsx`
  - 最近任务 Table 增加列宽、业务 render 和更合理横向滚动宽度。
- `NewRecognitionPage.tsx`
  - 隐私设置项使用 Arco `Checkbox` + 自定义企业级外观。
- `ui-arco-style-guards.test.ts`
  - 增加宽屏、表格、隐私设置、移动按钮/横滚守卫。

验证覆盖：

- 静态 UI 守卫。
- 移动端守卫。
- demo-web typecheck/build。
- 根级 typecheck/test。
- smoke runtime。
- Chrome CDP 浏览器 E2E 截图。

## 6. 问题清单（P0/P1/P2）

P0：

- 未发现当前 UI 阻塞级 P0。必跑 typecheck、test、style/mobile、build、smoke、browser E2E 均通过。

P1：

- 已修复：宽屏主体利用不足，截图中左右大面积空白已通过 1600px 容器和宽屏 grid 改善。
- 已修复：最近任务首列和模板列弱设计，已增加业务化 cell 层级。
- 已修复：隐私 checkbox 单薄感，已升级为企业级设置项。
- 已修复：按钮区/卡片 grid 在中小屏截断风险，已增加 wrap、minmax 和移动触摸区守卫。
- 剩余：仓库浏览器 E2E 默认 route text 断言未覆盖 `/schema`、`/evaluation`，扩展运行会在 `/schema` routeTextOk 失败。建议后续把脚本 route text 断言表扩到所有 demo-web 页面。

P2：

- 全量测试仍输出 Node `DEP0040 punycode` deprecation warning，属于既有依赖/运行时提示。
- Schema/Evaluation 的视觉截图未由默认浏览器脚本产出；本轮通过源码巡检和全局样式规则覆盖，后续可补专门截图路由白名单。
- Provider/Writeback 的真实外部系统连通性不属于 UI 修复范围，仍需生产 smoke/sandbox 验证。

## 7. 验收结论

UI 当前阶段：通过。

- 截图指出的宽屏空白、最近任务表格层级、顶部按钮/卡片拥挤、隐私 checkbox 单薄感均已明确改善。
- 全页面同类问题已通过计划、源码巡检、全局 CSS、静态守卫、移动守卫、browser E2E 和截图抽检形成闭环。
- `http://127.0.0.1:9901/` 可访问，并与当前 `apps/demo-web/dist/index.html` 引用同一 bundle。

医疗项目整体：未做最终完成判定。

- UI demo 当前阶段通过不等于医疗项目生产闭环最终完成。
- 真实 OCR/LLM Provider、LIMS 写回、生产密钥、外部 sandbox、队列/异步任务和生产数据治理仍需按外部集成验收单独关闭。

