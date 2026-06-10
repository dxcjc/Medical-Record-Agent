# Medical Open Design UI Polish Plan

生成时间：2026-06-09 CST

## Brainstorming

- Open Design MCP 可用，已读取 `od://focus/active`、Material、Professional、frontend-design、design-review 资源。active context 当前为 `active: false`，但资源目录可读，可作为设计参考。
- 设计方向保持 Material + Arco Design 医疗企业工作台：`#3370FF`、`#F7F8FA`、白侧栏、active pill、DM Sans + Noto Sans SC、8px 卡片和克制阴影。
- 页面不做营销式重写，重点提升真实医疗 AI 工作台的显示质量：识别任务、证据链、隐私合规、Provider 健康、写回队列、复核状态。
- 现有全局 polish 已解决宽屏/表格/隐私选项的一批问题，本轮继续增量增强标题区、KPI 统一性、表格可读性和跨页面一致性。

## Writing Plans

1. TDD/测试优先
   - 更新 `ui-arco-style-guards.test.ts`，先要求 Open Design 参考落地痕迹、专业 page hero、metric icon rail、operational strip、移动触摸区和表格横滚。
   - 运行 `test:styles` 确认新增守卫覆盖当前缺口。

2. 实现范围
   - `styles.css`：只做增量 patch，新增/强化 `page-header`、`page-header__meta`、`metric-card__icon`、`data-table-card`、`operations-status-strip`、`provider-row`、mobile 390px 规则。
   - `RecognitionShared.tsx` 与 `OperationsPrimitives.tsx`：让共享标题组件支持状态/元信息展示，不破坏现有调用。
   - 重点页面：识别看板、新建识别、Provider、写回、Schema、Evaluation；不修改后端业务契约。

3. 验证
   - 必跑：`test:styles`、`test:mobile`、`build`、`smoke:demo-web`。
   - 可行则跑：`e2e:demo-web:browser`。
   - 检查 `http://127.0.0.1:9901/` 和 `/api/health`，确认可访问且加载新 bundle。
   - 保存桌面和移动截图：首页/识别看板、新建识别、Provider、写回。

## Verification Before Completion

- 生成 `MEDICAL-OPEN-DESIGN-UI-FIX-REPORT.md`。
- 生成 `MEDICAL-OPEN-DESIGN-UI-AUDIT-REPORT.md`，审计报告包含 7 维度，并明确 UI 显示优化阶段是否通过。
- 不将医疗项目整体判定为最终完成；真实 OCR/LLM/LIMS、KMS/Vault、生产多实例等外部集成继续独立验收。
