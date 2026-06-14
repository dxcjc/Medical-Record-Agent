# Phase 10: 剩余问题修复

## 问题清单（Phase 9 验证后遗留）

### 1. 审计日志时间列全部显示 "-"
- 后端 API 返回的审计记录可能没有 `createdAt` 字段
- 需要检查：`curl /api/audit` 返回的数据结构
- 如果后端没有返回 `createdAt`，需要在后端 service 层添加
- 如果后端返回了但前端没渲染，修复前端列渲染

### 2. 创建人显示 cuid 而非用户名
- 任务列表中创建人列显示 `cmq38kgg50003wmziry1g9ce6`（cuid）
- API `/api/jobs` 返回的 job 对象需要包含 `createdByName` 字段
- 后端 jobs service 的 `list` 方法需要 JOIN users 表获取用户名
- 前端 `JobListPage.tsx` 使用 `createdByName || createdById || '-'` 显示

### 3. 反馈管理页仍然空白
- API `/api/feedback/all` 返回空数组
- 页面没有渲染表格（即使有数据也没有表格组件）
- 需要添加 EmptyState 组件显示"暂无反馈数据"
- 统计卡片需要显示数字（0 也要显示）

### 4. Dashboard 部分 Schema 显示英文名
- `lims-clinical-info` 在 Dashboard 最近任务中仍显示英文 key
- 需要确保所有 Schema 都有 `displayName` 字段
- 前端使用 `schema.displayName || schema.schemaKey` 作为降级

## 执行顺序
1. 先查后端 API 返回结构
2. 修后端（审计 createdAt + jobs createdByName）
3. 修前端（反馈空状态 + Schema 名称降级）
4. 构建验证
