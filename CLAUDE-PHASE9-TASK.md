# Phase 9: 审计问题修复计划

## 问题清单（前端实测发现）

### P0 — 阻断性
1. **创建任务提交崩溃** — `li.render is not a function`，Arco Message/Notification 都有此 bug
   - 修复：完全放弃 Arco 命令式 API，改用 React state + 内联 Toast 组件
   - 文件：`NewRecognitionPage.tsx`

2. **Provider 全部禁用** — 前端检查 `isBuiltin`，API 返回 `isDefault`
   - 修复：前端改用 `isDefault`，并为用户创建的 Provider 恢复操作按钮
   - 文件：`ProviderPage.tsx`

3. **反馈管理页空白** — 无表格、无空状态、3 个 JS 错误
   - 修复：添加空数据处理 + EmptyState 组件
   - 文件：`FeedbackPage.tsx`

### P1 — 功能缺陷
4. **趋势图不自动选中 Schema** — Phase 8 声称修了但没生效
   - 修复：检查 useEffect 逻辑，确保唯一 Schema 时自动选中
   - 文件：`DashboardPage.tsx`

5. **创建人显示 cuid** — 应该显示用户名
   - 修复：API 返回的 job 已包含 `createdByName`，前端使用该字段
   - 文件：`JobListPage.tsx`

6. **审计日志时间全部 "-"** — Phase 8 声称修了
   - 修复：确认后端是否返回 `createdAt`，前端格式化是否正确
   - 文件：`AuditPage.tsx`

7. **Dashboard Schema 显示英文名** — `tumor-gene-test` 而非中文名
   - 修复：用 schema.name 替代 schemaKey
   - 文件：`DashboardPage.tsx`

### P2 — 体验优化
8. **报表页面空壳** — 只有"返回工作台"链接
   - 修复：要么实现基本报表，要么从导航中移除
   - 文件：`routes.tsx` 或 `ReportsPage.tsx`
