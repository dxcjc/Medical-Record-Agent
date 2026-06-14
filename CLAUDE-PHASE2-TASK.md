# Phase 2 任务说明 — 功能闭环

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Phase 1 已完成：全局错误处理、路由前缀修复、登录持久化、缺失 API 补全。
现在要让每个页面的"主功能"真正可用——不只是"能看"，还要"能改"。

## 核心目标
5 个功能从"只读"升级为"可操作"：反馈闭环、Provider CRUD、Schema 编辑、评测导入、回写触发。

---

## 任务 1：反馈管理闭环

### 改动文件
- `apps/api/src/routes/feedback.routes.ts` — 增强 PATCH 审核
- `apps/api/src/services/feedback.service.ts` — 审核逻辑 + 写入知识库
- `medical-ui/src/pages/FeedbackPage.tsx` — 审核按钮 + 批量操作 + 状态筛选

### 后端需求

1. **PATCH /feedback/:id** — 已在 Phase 1 创建，需要增强：
   - 请求体：`{ status: 'approved' | 'rejected', reviewNote?: string }`
   - 如果 approved：自动写入 KnowledgeEntry 表
     - schemaKey = feedback.schemaKey
     - fieldName = feedback.fieldName
     - sourceValue = feedback.submittedValue（识别出的值）
     - targetValue = feedback.correctedValue（正确值）
     - source = 'feedback_review'
   - 创建审计日志记录

2. **PATCH /feedback/batch** — 批量审核（可选，如果时间允许）
   - 请求体：`{ ids: string[], status: 'approved' | 'rejected' }`

### 前端需求

1. **审核按钮**：每行反馈记录右侧显示「批准」「拒绝」按钮
   - 点击「批准」→ 确认弹窗 "确认批准此反馈？批准后将写入知识库" → loading → 成功 toast
   - 点击「拒绝」→ 弹出输入拒绝原因的 Modal → loading → 成功 toast

2. **批量审核**（可选）：
   - 表格左侧增加 checkbox 列
   - 底部浮动操作栏：选中 N 条 → 「批量批准」「批量拒绝」按钮

3. **状态筛选**：
   - 顶部增加 Tab 切换：待审核 / 已批准 / 已拒绝 / 全部
   - 默认显示"待审核"

4. **审核状态显示**：
   - 状态 Tag：待审核（蓝色）、已批准（绿色）、已拒绝（红色）
   - 已拒绝的显示拒绝原因

---

## 任务 2：Provider CRUD

### 改动文件
- `apps/api/src/routes/providers.routes.ts` — 增强 PUT/DELETE
- `medical-ui/src/pages/ProviderPage.tsx` — 新建/编辑表单 + 删除确认

### 后端需求

1. **PUT /providers/:id** — 更新 Provider
   - 可更新字段：name, endpoint, apiKey, isDefault, isActive
   - 如果设置 isDefault=true，自动将其他 Provider 设为 isDefault=false

2. **DELETE /providers/:id** — 删除 Provider
   - 检查是否有关联的 RecognitionJob，如果有则拒绝删除（返回 409）
   - 不能删除当前默认 Provider

### 前端需求

1. **新建 Provider**：
   - 页面右上角「新建 Provider」按钮
   - 点击打开 Modal/Drawer 表单
   - 字段：类型（dropdown: http/custom）、名称、Endpoint URL、API Key（密码输入框）、设为默认（Switch）
   - 「测试连接」按钮 → 调用健康检查 API → 显示结果
   - 「保存」按钮 → 创建 → 成功后刷新列表

2. **编辑 Provider**：
   - 列表行操作增加「编辑」
   - 打开同新建的 Modal/Drawer，预填现有数据

3. **删除 Provider**：
   - 列表行操作增加「删除」
   - 确认弹窗 "确认删除此 Provider？删除后无法恢复。"
   - 如果有关联任务，显示 "该 Provider 有关联任务，无法删除"

4. **启禁用切换**：
   - 列表增加「启用/禁用」Switch 列
   - 切换后即时更新

---

## 任务 3：Schema 新建/编辑

### 改动文件
- `apps/api/src/routes/schemas.routes.ts` — POST 新建 + PUT 编辑
- `medical-ui/src/pages/SchemaPage.tsx` — 新建表单 + 字段编辑器

### 后端需求

1. **POST /schemas** — 新建 Schema
   - 请求体：`{ key, name, description?, fields: SchemaField[] }`
   - 自动创建 version=1, status=active
   - key 必须唯一

2. **PUT /schemas/:id/fields** — 更新字段定义
   - 请求体：`{ fields: SchemaField[] }`
   - 创建新版本（version+1）
   - 旧版本设为 inactive

### 前端需求

1. **新建 Schema**：
   - SchemaPage 右上角「新建 Schema」按钮
   - 点击打开 Drawer/Modal
   - 字段：Schema Key（英文标识符）、名称、描述
   - 字段编辑器：
     - 动态表格：字段名、类型（string/number/boolean/date）、描述、是否必填、枚举值（逗号分隔）
     - 「添加字段」按钮
     - 拖拽排序（可选，如果时间不够用上下箭头）
   - 「保存」按钮

2. **编辑字段**：
   - Schema 详情页增加「编辑字段」按钮
   - 打开字段编辑器，预填现有字段
   - 保存时创建新版本

3. **版本对比**（可选）：
   - 详情页「版本历史」tab
   - 两个版本的字段差异高亮

---

## 任务 4：评测中心样本导入增强

### 改动文件
- `medical-ui/src/pages/EvaluationPage.tsx` — 新增导入方式

### 前端需求

1. **从识别结果导入**（最重要）：
   - 导入方式选择：「从已有识别结果导入」
   - 下拉选择已完成的任务（调用 jobsApi.list，过滤 status=completed）
   - 选择任务后预览其识别结果（表格形式：字段名 | 识别值 | 置信度）
   - 勾选要导入的字段 → 「导入为评测样本」
   - 自动填入：inputData = 原始 OCR 文本，expectedOutput = 识别结果

2. **表单逐条录入**：
   - 导入方式选择：「手动录入」
   - 表单：Schema Key（下拉）+ 动态字段列表（每个字段一个输入框）
   - 「添加一条」按钮 → 保存到样本列表

3. **CSV 上传**（可选）：
   - 导入方式选择：「CSV 上传」
   - 上传 CSV 文件，第一行为表头（字段名），后续行为数据
   - 预览导入结果

---

## 任务 5：回写手动触发

### 改动文件
- `apps/api/src/routes/writeback.routes.ts` — 增强触发 API
- `medical-ui/src/pages/WritebackPage.tsx` — 可回写任务列表 + 触发按钮

### 后端需求

1. **GET /writeback/eligible** — 获取可回写任务列表
   - 返回已完成（status=completed）且未回写过的任务
   - 包含任务基本信息 + 识别结果摘要

2. **POST /writeback/execute** — 已在 Phase 1 创建，确保：
   - 请求体：`{ jobId, confirmed: true, idempotencyKey? }`
   - 创建审计日志

### 前端需求

1. **可回写任务列表**：
   - "可回写任务" tab 默认不再为空
   - 展示已完成任务列表：任务 ID、Schema、完成时间、字段数
   - 每行操作：「回写」按钮

2. **回写流程**：
   - 点击「回写」→ 确认弹窗（预览将推送的字段）→ 确认 → loading → 成功/失败反馈
   - 失败后按钮变为「重试」

3. **回写目标配置提示**：
   - 如果没有配置回写目标，显示提示 "请先配置回写目标"
   - 引导到设置页面（或在页面内显示配置区域）

---

## 任务 6：构建验证 + 部署

### 步骤

1. 前端构建：
   ```bash
   cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
   ```

2. 重启 API：
   ```bash
   cd /tmp/Medical-Record-Agent && bash start-api.sh
   ```

3. 重载 nginx：
   ```bash
   sudo systemctl reload nginx
   ```

4. 运行后端测试：
   ```bash
   cd /tmp/Medical-Record-Agent && npx vitest run
   ```

---

## 验收标准

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE2-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **构建验证** — 前端 build 是否通过
3. **测试验证** — 后端测试通过数
4. **API 验证** — 新增 API curl 测试结果（需要先登录获取 token）
5. **UI 验证** — 关键功能截图/描述
6. **闭环验证** — 反馈→审核→写入知识库的完整流程
7. **代码质量** — 无硬编码、无 console.error 残留
8. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 2: 功能闭环 - 反馈审核/Provider CRUD/Schema 编辑/评测导入/回写触发" && git push` 提交。
