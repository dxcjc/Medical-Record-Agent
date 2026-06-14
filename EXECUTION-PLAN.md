# Medical Record Agent — 产品化执行说明书

> **版本**: v1.0
> **日期**: 2026-06-14
> **执行方式**: Claude Code 后台任务（串行 Phase，每 Phase 一个 Claude Code 进程）
> **规划文档**: `.hermes/plans/2026-06-14_product-optimization-plan.md`

---

## 一、执行总览

| Phase | 目标 | 预计工期 | 任务数 | 依赖 |
|-------|------|---------|--------|------|
| Phase 1 | 体验基础设施 | 2-3 天 | 7 项 | 无 |
| Phase 2 | 功能闭环 | 3-5 天 | 6 项 | Phase 1 完成 |
| Phase 3 | 数据与展示 | 2-3 天 | 5 项 | Phase 1 完成 |
| Phase 4 | 体验打磨 | 1-2 天 | 4 项 | Phase 2+3 完成 |

**总工期**: 8-13 天（串行执行）

---

## 二、执行流程

### 每个 Phase 的标准流程

```
1. 我写 Phase 任务说明文件（CLAUDE-PHASE{N}-TASK.md）
2. 启动 Claude Code 后台进程执行（terminal background + notify_on_complete）
3. Claude Code 完成后自动生成审计报告（PHASE{N}-AUDIT.md）
4. 我审核审计报告
5. 审核通过 → 推 GitHub → 进入下一个 Phase
6. 审核不通过 → 打回重做
```

### 每个 Phase 完成后的验收维度

| 维度 | 检查内容 |
|------|---------|
| 功能完整性 | 每个任务是否按需求完成 |
| 构建验证 | 前端 `vite build` 是否通过 |
| 测试验证 | 后端测试是否通过 |
| API 验证 | 新增/修复的 API 是否可调用 |
| UI 验证 | 页面按钮点击是否有反馈 |
| 错误处理 | 错误信息是否中文化 |
| 代码质量 | 无 console.error 残留、无硬编码 |
| Git 提交 | commit message 是否清晰 |

---

## 三、Phase 1 详细任务（体验基础设施）

### 任务 1：全局 API 错误拦截器 + 错误信息中文化

**目标**: 所有 API 错误统一处理，技术错误翻译为中文提示

**改动文件**:
- `medical-ui/src/api/client.ts` — request() 函数改造
- `medical-ui/src/api/errorMessages.ts` — 新建，错误码→中文映射

**具体需求**:
1. POST/DELETE/PUT 请求如果没有 body，自动补 `{}`
2. 统一 catch 所有非 ok 响应，提取服务端 message/error 字段
3. 401 去重锁：全局 flag，多请求同时 401 只跳转一次
4. 错误信息中文化：`FST_ERR_CTP_EMPTY_JSON_BODY` → "请求格式错误，请重试"

### 任务 2：全局 React Error Boundary

**目标**: 渲染报错不再白屏

**改动文件**:
- `medical-ui/src/components/ErrorBoundary.tsx` — 新建
- `medical-ui/src/App.tsx` — 包裹路由

**具体需求**:
1. 捕获子组件渲染错误
2. 显示友好错误页（图标 + "页面出错了" + 刷新/返回首页按钮）
3. 错误上报（console.error）

### 任务 3：全局网络状态检测

**目标**: 服务器宕机时有统一提示

**改动文件**:
- `medical-ui/src/components/NetworkStatus.tsx` — 新建
- `medical-ui/src/App.tsx` — 挂载组件

**具体需求**:
1. 定期 ping API（每 30 秒）
2. 不可达时页面顶部显示红色提示条 "服务器连接中断，请检查网络"
3. 恢复后自动消失

### 任务 4：修复登录状态持久化

**目标**: 刷新页面不丢失登录

**改动文件**:
- `medical-ui/src/App.tsx` — useEffect 调用 restore()

**具体需求**:
1. App 挂载时调用 `authStore.restore()`
2. restore() 从 localStorage 读取 token 并验证
3. 验证失败则清除 token，不跳转（避免循环）

### 任务 5：修复 API 路由前缀不一致

**目标**: 字段统计、Dashboard 统计、趋势图正常返回数据

**改动文件**:
- 后端 `src/routes/` 目录下 stats 相关路由

**具体需求**:
1. 检查所有后端路由注册，统一不带 `/api/` 前缀
2. 特别检查：`/api/stats/fields`、`/api/stats/dashboard`、`/api/stats/trend`
3. nginx 已经去掉 `/api` 前缀转发，后端不应再带

### 任务 6：补全缺失的 API 路由

**目标**: 反馈审核、Provider 创建、任务导出可用

**改动文件**:
- 后端 `src/routes/feedback.ts` — 新增 PATCH /:id
- 后端 `src/routes/providers.ts` — 新增 POST /
- 后端 `src/routes/jobs.ts` — 新增 GET /:id/export

**具体需求**:
1. `PATCH /feedback/:id` — 更新审核状态（approved/rejected），返回更新后的记录
2. `POST /providers` — 创建 Provider 记录，返回创建结果
3. `GET /jobs/:id/export` — 导出任务识别结果（JSON 格式）

### 任务 7：构建验证 + 部署

**目标**: 所有改动生效

**步骤**:
1. `cd medical-ui && npx vite build` — 前端构建
2. `bash start-api.sh` — 重启 API（加载 .env）
3. `sudo systemctl reload nginx` — 重载 nginx
4. 验证页面可访问

---

## 四、Phase 2 详细任务（功能闭环）

### 任务 1：反馈管理闭环

**目标**: 反馈从提交→审核→写入知识库，全流程闭环

**改动文件**:
- 后端 `src/routes/feedback.ts` — PATCH 审核 + 批准写入知识库
- 前端 `FeedbackPage.tsx` — 审核按钮 + 批量操作 + 状态筛选

**验收标准**:
- 反馈列表有"批准""拒绝"按钮
- 批量选择后可批量批准/拒绝
- 批准的反馈自动写入 KnowledgeEntry 表
- RAG 检索能命中反馈修正的字段值

### 任务 2：Provider CRUD

**目标**: Provider 可新建/编辑/删除

**改动文件**:
- 后端 `src/routes/providers.ts` — POST/PUT/DELETE
- 前端 `ProviderPage.tsx` — 新建/编辑表单 + 删除确认

**验收标准**:
- "新建 Provider"按钮 → 表单（类型/endpoint/API Key）→ 保存
- 列表行有"编辑""删除"操作
- 删除前确认弹窗
- 设置默认、启禁用切换

### 任务 3：Schema 新建/编辑

**目标**: Schema 可新建、字段可编辑

**改动文件**:
- 后端 `src/routes/schemas.ts` — POST 新建 + PUT 编辑
- 前端 `SchemaPage.tsx` — 新建表单 + 字段编辑器

**验收标准**:
- "新建 Schema"按钮 → 表单（key/名称/描述）
- 字段编辑器（添加/删除/排序/类型/必填/枚举值）
- 发布新版本（草稿→验证→发布）

### 任务 4：评测中心样本导入增强

**目标**: 非技术用户也能导入评测样本

**改动文件**:
- 前端 `EvaluationPage.tsx` — 新增导入方式

**验收标准**:
- "从识别结果导入"：下拉选择任务 → 预览 → 一键导入
- 表单逐条录入（字段名 + 期望值）
- CSV 上传

### 任务 5：回写手动触发

**目标**: 可手动触发回写

**改动文件**:
- 后端 `src/routes/writeback.ts` — 触发 API
- 前端 `WritebackPage.tsx` — 可回写任务列表 + 触发按钮

**验收标准**:
- "可回写任务"tab 展示已完成任务列表
- 一键回写按钮 → 确认弹窗 → loading → 成功/失败反馈
- 回写失败可重试

---

## 五、Phase 3 详细任务（数据与展示）

### 任务 1：任务列表分页 + 搜索

**改动文件**: 后端 `jobs.ts` + 前端 `JobsPage.tsx`

**验收标准**:
- 后端支持 page/pageSize/total
- 前端分页组件
- 搜索框（任务 ID/Schema 名）
- 状态筛选下拉框

### 任务 2：任务列表列数据补全

**改动文件**: 后端 `jobs.ts` + 前端 `JobsPage.tsx`

**验收标准**:
- 文件名、置信度、需复核数显示真实数据（或隐藏无数据的列）

### 任务 3：Dashboard 趋势图

**改动文件**: 后端 `stats.ts` + 前端 `DashboardPage.tsx`

**验收标准**:
- 最近 7 天识别趋势折线图
- 快捷操作入口

### 任务 4：审计日志筛选导出

**改动文件**: 后端 `audit.ts` + 前端 `AuditPage.tsx`

**验收标准**:
- 时间/类型/操作人筛选
- 导出 CSV

### 任务 5：字段统计 API 修复

**改动文件**: 后端 `stats.ts`

**验收标准**:
- `/stats/fields` 返回正确的字段识别统计数据

---

## 六、Phase 4 详细任务（体验打磨）

### 任务 1：Skeleton 加载态
关键页面（Dashboard/任务列表/任务详情）加骨架屏

### 任务 2：移动端响应式
侧边栏 ≤768px 折叠，表格横向滚动，触摸区域 ≥44px

### 任务 3：空状态引导
空列表显示插画 + 操作引导文案

### 任务 4：Token Refresh
实现 token 静默续期机制

---

## 七、技术约束

| 约束 | 说明 |
|------|------|
| 不设 max-turns | 让 Claude Code 自然完成，用 timeout 控制总时长 |
| 串行执行 | 一个 Phase 完成再启动下一个，避免代码冲突 |
| 后台进程 | `terminal(background=true, notify_on_complete=true)` |
| 任务文件 | 用 `write_file` 创建，不用 heredoc |
| 审计报告 | 每个 Phase 完成必须生成 PHASE{N}-AUDIT.md |
| Git 提交 | 每个 Phase 完成后推 GitHub |

---

## 八、风险与应对

| 风险 | 应对 |
|------|------|
| Claude Code 429 限流 | 等 30 秒重试 |
| Claude Code 超时 | 检查进度，必要时拆分任务 |
| 构建失败 | Claude Code 自行修复，不手动干预 |
| API 路由改动影响现有功能 | 后端测试覆盖 + 手动验证核心流程 |

---

## 九、交付物清单

| Phase | 交付物 |
|-------|--------|
| Phase 1 | PHASE1-AUDIT.md + 全局错误处理 + 路由修复 + 登录持久化 |
| Phase 2 | PHASE2-AUDIT.md + 反馈闭环 + Provider CRUD + Schema 编辑 + 评测导入 + 回写触发 |
| Phase 3 | PHASE3-AUDIT.md + 分页搜索 + 列数据 + 趋势图 + 审计导出 |
| Phase 4 | PHASE4-AUDIT.md + Skeleton + 移动端 + 空状态 + Token refresh |
