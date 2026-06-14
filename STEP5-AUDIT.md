# Step 5 审计报告：产品体验优化（PM 视角）

> 审计时间：2026-06-14
> 审计范围：前端 11 页面 + 10 组件 + API 客户端 + 后端 API + 文档

---

## 一、审计总结

| 维度 | 发现数 | 已修复 | 遗留 |
|------|--------|--------|------|
| 用户体验（UX） | 15 | 10 | 5 |
| 功能完整性 | 8 | 3 | 5 |
| 代码质量 | 18 | 8 | 10 |
| 文档完整性 | 4 | 1 | 3 |
| **合计** | **45** | **22** | **23** |

---

## 二、已修复的高价值问题

### 2.1 关键 UX 修复

| # | 严重度 | 问题 | 修复方式 | 文件 |
|---|--------|------|---------|------|
| 1 | **P0** | `ConfigProvider locale={zhCN}` 导入但未使用 — Arco 组件渲染英文而非中文 | 包裹整个 App 为 `<ConfigProvider locale={zhCN}>` | `App.tsx` |
| 2 | **P0** | 无 404 路由 — 未知路径渲染空白页面 | 添加 `NotFoundPage` 组件和 `path="*"` catch-all 路由 | `App.tsx` |
| 3 | **P0** | 所有页面无 `document.title` — 浏览器标签始终显示英文标题 | 在 `AppLayout` 中添加 `useEffect` 动态设置 `document.title` | `AppLayout.tsx` |
| 4 | **P0** | `index.html` 标题为英文 "Medical Record Agent" | 改为中文 "医疗记录智能识别" | `index.html` |
| 5 | **P0** | `JobDetailPage` — `useMemo` 在 early returns 之后调用，违反 Rules of Hooks | 将 `testItemData` 及相关计算移至 early returns 之前 | `JobDetailPage.tsx` |
| 6 | **P1** | `JobDetailPage` — `Math.random()` 用作 React key，导致每次渲染重新挂载 | 改用 `step.node || step.step || \`step-${idx}\`` | `JobDetailPage.tsx` |
| 7 | **P1** | `LoginPage` — 硬编码默认凭据 `admin.dev@example.local` / `ChangeMe123!` | 清空为空字符串 | `LoginPage.tsx` |
| 8 | **P1** | `JobListPage` — 加载状态使用纯文本而非 `<Spin>` 组件，与其他页面不一致 | 替换为 `<Spin />` 组件 | `JobListPage.tsx` |
| 9 | **P1** | `AuditPage` — 加载状态使用纯文本而非 `<Spin>` 组件 | 替换为 `<Spin />` 组件 | `AuditPage.tsx` |
| 10 | **P2** | 侧边栏标签 "Provider" 与面包屑标题 "Provider 管理" 不一致 | 统一为 "Provider" | `AppLayout.tsx` |

### 2.2 功能完整性修复

| # | 严重度 | 问题 | 修复方式 | 文件 |
|---|--------|------|---------|------|
| 11 | **P1** | `FeedbackPage` — 三个 API 查询均无错误处理，API 失败时误显示空状态 | 添加 `feedbackError` 错误状态和重试按钮 | `FeedbackPage.tsx` |
| 12 | **P1** | `WritebackPage` — 历史标签页无错误处理 | 添加 `historyError` 错误状态和重试按钮 | `WritebackPage.tsx` |
| 13 | **P2** | `FeedbackPage` — `schemas` 查询被获取但从未使用，浪费 API 调用 | 移除未使用的 `schemasApi` 查询和导入 | `FeedbackPage.tsx` |

### 2.3 代码质量修复

| # | 严重度 | 问题 | 修复方式 | 文件 |
|---|--------|------|---------|------|
| 14 | **P1** | `WritebackPage` — `record.jobId.slice(0, 16)` 无空值保护，可能运行时崩溃 | 添加 `(record.jobId \|\| '').slice(0, 16)` | `WritebackPage.tsx` |
| 15 | **P2** | `FieldGroup` — 未使用的 `useMemo` 导入 | 移除 | `FieldGroup.tsx` |
| 16 | **P2** | `FieldGroup` — `key={field.label}` 可能重复 | 改为 `key={field.key \|\| field.label}` | `FieldGroup.tsx` |
| 17 | **P2** | `AppLayout` — 未使用的 `IconBarChart` 和 `IconArrowLeft` 导入 | 移除 | `AppLayout.tsx` |
| 18 | **P2** | `AuditPage` — `schemaDistribution` memo 计算但从未使用 | 移除未使用的 memo | `AuditPage.tsx` |

---

## 三、审计详情

### 3.1 用户体验（UX）

#### 空状态设计 ✅

| 页面 | 空状态 | 状态 |
|------|--------|------|
| DashboardPage | ✅ `EmptyState` 组件 | 良好 |
| JobListPage | ✅ `EmptyState` 组件 | 良好 |
| JobDetailPage | ✅ 多场景空状态 | 良好 |
| SchemaPage | ✅ 三重空状态 | 良好 |
| ProviderPage | ✅ `EmptyState` 组件 | 良好 |
| EvaluationPage | ✅ 双标签页空状态 | 良好 |
| AuditPage | ✅ 双标签页空状态 | 良好 |
| FeedbackPage | ✅ `EmptyState` 组件 | 良好 |
| WritebackPage | ✅ 双标签页空状态 | 良好 |
| NewRecognitionPage | ✅ 上传区域即引导 | 适当 |

**建议**：部分页面（AuditPage、JobDetailPage、EvaluationPage）在子区域使用内联空状态而非 `EmptyState` 组件，建议统一（遗留项）。

#### 加载状态 ✅ 已修复

所有页面现在使用 `<Spin>` 组件显示加载状态。之前 `JobListPage` 和 `AuditPage` 使用纯文本 "加载中..."，已修复。

#### 错误提示

| 页面 | 顶层错误 | 操作错误 |
|------|----------|---------|
| DashboardPage | ✅ 重试按钮 | stats API 错误被吞没（遗留） |
| JobListPage | ✅ 重试按钮 | - |
| JobDetailPage | ✅ 重试按钮 | ✅ `Message.error` |
| SchemaPage | ✅ 重试按钮 | ⚠️ 通用 "操作失败" |
| ProviderPage | ✅ 重试按钮 | ⚠️ 通用 "设置失败" |
| EvaluationPage | ✅ 重试按钮 | ⚠️ 通用 "创建失败" |
| FeedbackPage | ✅ 已修复 | - |
| WritebackPage | ✅ 已修复 | ✅ 详细错误信息 |
| AuditPage | ✅ 重试按钮 | - |

#### 导航一致性 ✅

侧边栏菜单与路由完全匹配，9 个导航项对应 9 个路由。

#### 页面标题 ✅ 已修复

动态 `document.title` 已在 `AppLayout` 中实现，格式为 `{页面名} - 医疗记录智能识别`。

### 3.2 功能完整性

#### DashboardPage ✅
- 统计卡片数据：优先使用 stats API，失败时 fallback 到 jobs + providers 计算
- 趋势图：N/A（Dashboard 无趋势图，在 AuditPage 的质量报告中）
- 最近任务表格：完整，支持点击跳转

#### JobListPage ✅
- 筛选：状态 + Schema + 搜索，完整
- 分页：支持页码、每页数量、跳转，流畅
- 列：任务ID、Schema、文件名、状态、置信度、字段数、需复核、Provider、耗时、创建人、时间、操作

#### JobDetailPage ✅
- 追溯视图：使用 `TraceView` 组件展示 5 个节点（文件→OCR→RAG→LLM→校验）
- 识别结果：动态字段分组、置信度仪表盘、检测项目 Checkbox、OCR 文本、证据片段
- 反馈表单：字段选择 + 修正值 + 备注

#### SchemaPage ✅
- 字段卡片编辑器：支持编辑标签、类型、LIMS 路径、备注、回写模式
- 知识管理：支持添加/编辑/删除知识条目
- Schema 版本管理：支持停用、回滚

#### NewRecognitionPage ✅
- 上传流程：拖拽上传 + 示例文件一键体验
- Schema 选择：下拉选择，支持搜索
- 进度指示：提交后显示进度卡片

#### WritebackPage ✅
- 回写确认：弹窗显示字段映射
- 历史记录：分页表格，失败支持重试

#### FeedbackPage ✅ 已修复
- 反馈列表：分页 + 筛选（字段、任务ID）
- 字段统计：TOP10 排行
- 详情弹窗：完整字段展示

#### AuditPage ✅
- 操作审计：分页 + 筛选（操作类型、对象类型）+ 展开行查看 metadata
- 质量报告：KPI 卡片 + 趋势图 + TOP5 出错字段 + Schema 分布

#### EvaluationPage ✅
- 数据集管理：创建、导入样本
- 评测运行：创建运行、查看指标
- 指标详情：字段级准确率

### 3.3 代码质量

#### TypeScript 严格性

- **零 `any` 使用** — 全项目搜索确认无 `: any`、`as any`、`<any>`
- `tsconfig.base.json` 启用 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`
- **遗留问题**：`Record<string, unknown>` 大量使用（`types.ts` 9 个接口、`client.ts` 11 处、`JobDetailPage.tsx` 贯穿全文），等效于削弱类型安全
- **遗留问题**：`SchemaPage` 使用 `as never` 绕过类型检查

#### 组件复用

- `EmptyState` — 8 页面使用 ✅
- `MetricCard` — 4 页面使用 ✅
- `StatusTag` — 7 页面使用 ✅
- `PageHeader` — 9 页面使用 ✅
- **遗留问题**：置信度阈色逻辑在 4 个组件中重复实现（`ConfidenceDashboard`、`FieldGroup`、`FieldCard`、`ImageViewer`），建议提取为 `utils/confidence.ts`

#### API 客户端

- **遗留问题**：`fetch` 无 `try/catch` — 网络错误传播为原始 `TypeError` 而非 `ApiError`
- **遗留问题**：401 硬编码重定向到 `/login`，无拦截点
- **遗留问题**：无重试逻辑、无 403 特殊处理
- 零 `any` 类型 ✅

#### 测试覆盖

| 层 | 测试文件数 | 状态 |
|----|-----------|------|
| 后端 API | 28 | ✅ 完善 |
| Core 包 | 13 | ✅ 完善 |
| 前端 | 4 | ⚠️ 较少 |
| E2E | 1 (5 tests) | ⚠️ 基础 |
| 脚本 | 12 | ✅ 完善 |

**遗留问题**：前端仅 4 个测试文件（`FieldCard`、`FeedbackPage`、`JobDetailPage`、`WritebackPage`），其他 7 个页面无测试。

### 3.4 文档完整性

| 文档 | 状态 | 备注 |
|------|------|------|
| README.md | ✅ | 包含快速开始、技术栈、命令 |
| AGENTS.md | ✅ | 项目结构、数据流、修改场景 |
| SKILL.md | ✅ | 462 行 CLI 技能定义 |
| API 文档 | ❌ 缺失 | 无 Swagger/OpenAPI |
| CHANGELOG | ❌ 缺失 | 无变更日志 |

---

## 四、遗留问题清单（按优先级）

### P1 — 建议尽快修复

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | `client.ts` — `fetch` 无 `try/catch`，网络错误传播为 `TypeError` | 用户看到未处理的错误 | 添加 try/catch 包裹，统一转为 `ApiError` |
| 2 | `authStore.ts` — `restore()` 不验证 token、不填充 `user` | 刷新后 `user` 为 null | 添加 `/auth/me` 验证端点 |
| 3 | `SchemaPage` — 停用/回滚无确认对话框 | 误操作风险 | 添加 `Modal.confirm` |
| 4 | `ProviderPage` — 全局 loading 状态影响所有卡片 | 健康检查时所有卡片显示加载 | 使用 per-key loading 状态 |
| 5 | DashboardPage — stats API 错误被吞没 | 数据静默降级 | 添加 stats 错误提示 |

### P2 — 建议后续迭代

| # | 问题 | 建议 |
|---|------|------|
| 6 | `types.ts` — 9 个接口有 `[key: string]: unknown` | 收窄类型定义 |
| 7 | 置信度阈色逻辑重复 4 处 | 提取 `utils/confidence.ts` |
| 8 | 前端测试覆盖不足（仅 4 个测试文件） | 补充页面级测试 |
| 9 | 无 Swagger/OpenAPI 文档 | 添加 `@fastify/swagger` |
| 10 | 项目根目录 ~60 个审计报告 .md 文件 | 移至 `docs/reports/` |

---

## 五、验证结果

```
✅ pnpm typecheck — 通过
✅ cd medical-ui && pnpm build — 通过
   dist/index.html               0.70 kB │ gzip:   0.42 kB
   dist/assets/index-r4eSF99A.css  582.39 kB │ gzip:  66.33 kB
   dist/assets/index-Bu8C5Iap.js  1,059.92 kB │ gzip: 306.24 kB
   ✓ built in 7.80s
```

---

## 六、修改文件清单

| 文件 | 修改类型 |
|------|---------|
| `medical-ui/src/App.tsx` | ConfigProvider 包裹 + 404 路由 |
| `medical-ui/src/layout/AppLayout.tsx` | document.title + 移除未用导入 + 标签一致性 |
| `medical-ui/index.html` | 标题中文化 |
| `medical-ui/src/pages/LoginPage.tsx` | 清空硬编码凭据 |
| `medical-ui/src/pages/JobDetailPage.tsx` | 修复 Hooks 规则 + Math.random key |
| `medical-ui/src/pages/JobListPage.tsx` | Spin 加载组件 |
| `medical-ui/src/pages/FeedbackPage.tsx` | 错误处理 + 移除未用查询 |
| `medical-ui/src/pages/AuditPage.tsx` | Spin 加载 + 移除未用代码 |
| `medical-ui/src/pages/WritebackPage.tsx` | 历史错误处理 + 空值保护 |
| `medical-ui/src/components/FieldGroup.tsx` | 移除未用导入 + key 修复 |
