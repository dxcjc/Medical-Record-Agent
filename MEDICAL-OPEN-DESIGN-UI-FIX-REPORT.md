# Medical Open Design UI Fix Report

生成时间：2026-06-09 CST

## Open Design MCP 状态

- 已通过 MCP 只读资源检查 `open-design` server：可读取 `od://focus/active`、Open Design skills 与 design-systems 资源。
- `od://focus/active` 返回 `{"active": false}`，说明当前没有活动画布上下文，但 MCP 资源可用。
- 已读取并参考：
  - `od://design-systems/material/DESIGN.md`
  - `od://design-systems/professional/DESIGN.md`
  - `od://skills/frontend-design/SKILL.md`
  - `od://skills/design-review/SKILL.md`
- `list_mcp_resource_templates` 返回空列表。Open Design daemon 地址按任务上下文为 `http://127.0.0.1:7456`。

## Superpowers 流程

- Brainstorming：读取 Open Design 资源、历史 UI 报告和关键页面，确定 Material + Arco Design 医疗企业工作台方向。
- Writing-plans：新增 `docs/superpowers/plans/2026-06-09-medical-open-design-ui-polish.md`。
- TDD/测试优先：先更新 `apps/demo-web/src/ui-arco-style-guards.test.ts`，新增 Open Design hero、KPI、表格、移动端与宽屏守卫；首次运行出现预期红灯，随后实现通过。
- Verification-before-completion：完成指定测试、build、smoke、browser E2E、9901 页面和 `/api/health` 检查，并保存截图。

## 读取参考

- 根目录未发现 `CLAUDE.md`。
- 已读取历史报告：`MEDICAL-UI-GLOBAL-POLISH-AUDIT-REPORT.md`、`MEDICAL-UI-GLOBAL-POLISH-FIX-REPORT.md`。
- 已读取并修改/参考指定页面与样式：`styles.css`、`AppShell.tsx`、Recognition Dashboard、New Recognition、Provider、Writeback、Schema Studio、Evaluation。

## 本轮增量修改

- `apps/demo-web/src/styles.css`
  - 增加 Open Design 参考注释与增量视觉 token。
  - 页面标题区升级为轻量工作台 hero：边框、浅医疗蓝渐变、状态摘要 grid。
  - KPI 卡片增加 accent rail、统一 40px 图标背景、表头/单元格细节和超宽屏 `1720px` 容器规则。
  - 增加 `data-table-card`、`operations-status-strip`、480px 移动端单列与触摸区守卫规则。
- `RecognitionShared.tsx`、`OperationsPrimitives.tsx`
  - 共享标题组件增加可选 `meta` 插槽，不破坏既有调用。
- `RecognitionDashboardPage.tsx`
  - 标题区增加证据链、复核状态、Provider 摘要。
  - 最近任务表格容器使用 `data-table-card`。
- `NewRecognitionPage.tsx`
  - 标题区增加上传限制、隐私默认、写回策略摘要。
- `ProviderSettingsPage.tsx`
  - 标题区增加健康实例、API Provider、密钥策略摘要。
  - 增加 Provider 操作状态条。
- `WritebackPage.tsx`
  - 标题区增加可执行任务、复核阻断、权限摘要。
  - 增加写回操作状态条。
- `SchemaStudioPage.tsx`
  - 标题区增加生产版本、草稿版本、影响管道摘要。
- `EvaluationPage.tsx`
  - 标题区增加数据集、样本总量、脱敏风险摘要。
- `ui-arco-style-guards.test.ts`
  - 新增 Open Design UI、宽屏 1680+、KPI、表格、480px 移动端守卫。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed、14 skipped |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，生成 `index-GKrOmEWy.js`、`index-DQiDqSz2.css` 等新 bundle |
| `corepack pnpm smoke:demo-web` | 通过，`apiHealthOk=true`、`distBundleOk=true` |
| `corepack pnpm e2e:demo-web:browser` | 通过，`browserE2E=passed`、`engine=chrome-cdp` |
| `DEMO_WEB_BROWSER_E2E_DESKTOP_WIDTH=1920 ... corepack pnpm e2e:demo-web:browser` | 通过，补充 1920px 宽屏截图 |

## 9901 检查

- `http://127.0.0.1:9901/` 可访问。
- 返回 HTML 与 `apps/demo-web/dist/index.html` 一致，引用新 bundle：
  - `/assets/index-GKrOmEWy.js`
  - `/assets/index-DQiDqSz2.css`
- `http://127.0.0.1:9901/api/health` 返回：

```json
{"status":"ok","service":"medical-record-agent-api"}
```

## 截图路径

默认 1440 桌面与 390x844 移动视口截图目录：`ui-parity-screenshots/medical-e2e-current/`

- 桌面首页/识别看板：`ui-parity-screenshots/medical-e2e-current/desktop-home.png`
- 桌面新建识别：`ui-parity-screenshots/medical-e2e-current/desktop-recognition-new.png`
- 桌面 Provider：`ui-parity-screenshots/medical-e2e-current/desktop-providers.png`
- 桌面写回：`ui-parity-screenshots/medical-e2e-current/desktop-writeback.png`
- 移动首页/识别看板：`ui-parity-screenshots/medical-e2e-current/mobile-home.png`
- 移动新建识别：`ui-parity-screenshots/medical-e2e-current/mobile-recognition-new.png`
- 移动 Provider：`ui-parity-screenshots/medical-e2e-current/mobile-providers.png`
- 移动写回：`ui-parity-screenshots/medical-e2e-current/mobile-writeback.png`

补充 1920px 桌面截图目录：`ui-parity-screenshots/medical-open-design-1920/`

## 验收口径

UI 显示优化阶段：通过。

医疗项目整体不在本报告中判定最终完成。真实 OCR/LLM/LIMS、KMS/Vault、生产多实例、外部 sandbox 与生产数据治理仍需独立验收。
