# Phase 6 任务说明 — P0/P1 核心缺陷修复

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Phase 1-5 完成了产品化基础建设。但用户实际使用后发现大量体验问题：Provider 操作无效、审计日志英文枚举、任务列表数据缺失、全局反馈不统一。本次修复所有 P0 和 P1 级别问题。

## 核心目标
让系统从"能跑"变成"能用"——所有按钮有反馈、所有数据可读、所有操作可逆。

---

## 任务 1：Provider 分类展示 + 系统内置标记

### 改动文件
- `medical-ui/src/pages/ProviderPage.tsx` — 分类展示 + 内置标记

### 具体需求

1. **按类型分组展示**：
   - 使用 Arco Tabs 或分组标题，按 `kind` 分为：OCR 提供商 / 大模型提供商 / 存储服务 / 写回适配器
   - 每个分组有简短说明文字：
     - OCR：「用于识别文档中的文字内容」
     - LLM：「用于智能提取和理解识别结果」
     - Storage：「用于存储上传的文件和识别结果」
     - LIMS：「用于将识别结果回写到实验室信息系统」

2. **系统内置 Provider 标记**：
   - 数据库中只有 3 个 Provider（local-storage-default, local-lims-sandbox, volces-seed-2-pro）
   - UI 显示的 7 个中有 4 个来自配置/环境变量（http-ocr, openai-compatible-model, lims-writeback, local-storage）
   - 判断方式：如果 API 返回的 Provider 没有 `createdAt` 或 `createdAt` 为 null，标记为"系统内置"
   - 系统内置 Provider：显示灰色 Tag「系统内置」，禁用"编辑""删除"按钮（按钮存在但 disabled + tooltip "系统内置 Provider 不可删除"）
   - 系统内置 Provider 的 switch 开关也禁用（disabled + tooltip）

3. **修复 Invalid Date**：
   - 如果 `createdAt` 为 null 或无效，显示 `-` 而不是 `Invalid Date`
   - 格式化函数：`createdAt ? new Date(createdAt).toLocaleString('zh-CN') : '-'`

4. **Endpoint 空值处理**：
   - 如果 Endpoint 为 `-` 或空，隐藏该行不显示

---

## 任务 2：Schema 停用/启用双向操作

### 改动文件
- `medical-ui/src/pages/SchemaPage.tsx` — 列表和详情增加启用按钮

### 具体需求

1. **列表页**：
   - 状态列：显示 Tag，激活=绿色"激活"，停用=红色"停用"
   - 操作列：根据状态显示对应按钮
     - 状态为 active → 显示「停用」按钮
     - 状态为 inactive → 显示「启用」按钮
   - 启用操作调用已有的 API（需要检查是否有 activate 端点，如果没有需要新增）

2. **详情页**：
   - 根据当前状态显示「停用」或「启用」按钮
   - 已有「停用」按钮，增加「启用」按钮

3. **后端**（如果缺少启用 API）：
   - `PATCH /schemas/versions/:id/activate` — 将 SchemaVersion 状态设为 active
   - 同一 schemaKey 的其他版本自动设为 inactive

---

## 任务 3：全局 Toast 系统统一

### 改动文件
- `medical-ui/src/components/GlobalToast.tsx` — 新建全局 Toast 组件
- `medical-ui/src/api/client.ts` — 全局错误拦截接入 Toast
- `medical-ui/src/App.tsx` — 挂载 GlobalToast
- 所有使用 `Message.error/success` 的页面 — 替换为全局 Toast

### 具体需求

1. **全局 Toast 组件**：
   - 使用 Arco 的 `Message` 组件，但统一配置：
     - 成功：`Message.success`，绿色，3 秒自动关闭
     - 失败：`Message.error`，红色，5 秒自动关闭（比成功更长，让用户看到）
     - 警告：`Message.warning`，黄色，4 秒
     - 信息：`Message.info`，蓝色，3 秒

2. **全局错误拦截**：
   - `client.ts` 的 `request()` 函数 catch 中，自动调用全局 Toast
   - 提取服务端 `message` 或 `error` 字段作为 Toast 内容
   - 如果没有服务端消息，使用中文默认消息（errorMessages.ts 已有映射）

3. **关键操作的成功 Toast 必须包含操作对象**：
   - ❌ `Message.success('操作成功')`
   - ✅ `Message.success('已删除 Provider: http-ocr')`
   - ✅ `Message.success('已停用 Schema: 肿瘤基因检测申请单')`

4. **替换所有页面的 Message 调用**：
   - 统一使用全局 Toast 函数，不再直接调用 `Message.error('操作失败')`
   - 失败消息必须包含原因，不能只说"操作失败"

---

## 任务 4：审计日志全面修复

### 改动文件
- `medical-ui/src/pages/AuditPage.tsx` — 时间格式化 + 枚举中文化 + 列宽修复

### 具体需求

1. **时间格式化**：
   - 后端返回 ISO 时间字符串，前端格式化为 `YYYY-MM-DD HH:mm:ss`
   - 如果时间为空或无效，显示 `-`
   - 代码：`new Date(createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })`

2. **操作类型中文化**：
   - 创建翻译映射表：
     ```
     schema.create → 创建 Schema
     schema.update → 更新 Schema
     schema.deactivate → 停用 Schema
     schema.activate → 启用 Schema
     schema.rollback → 回滚 Schema
     provider.create → 创建 Provider
     provider.update → 更新 Provider
     provider.delete → 删除 Provider
     provider.config.save → 保存 Provider 配置
     result.view → 查看识别结果
     result.export → 导出识别结果
     feedback.submit → 提交反馈
     feedback.review → 审核反馈
     feedback.batch.review → 批量审核反馈
     file.upload → 上传文件
     file.download → 下载文件
     job.create → 创建识别任务
     job.rerun → 重跑识别任务
     writeback.execute → 执行回写
     auth.login → 用户登录
     ```
   - 未匹配的 action 显示原始值（兜底）

3. **结果列中文化**：
   - `success` → 「成功」（绿色 Tag）
   - `failure` → 「失败」（红色 Tag）

4. **对象 ID 列修复**：
   - ID 文本截断显示前 12 个字符 + `...`
   - 鼠标 hover 显示完整 ID（tooltip）
   - 设置列宽为固定宽度，防止换行

5. **对象类型中文化**：
   - `Schema` → 「Schema」
   - `Provider` → 「Provider」
   - `任务` → 「任务」
   - `文件` → 「文件」
   - `反馈` → 「反馈」

---

## 任务 5：评测中心增加运行评测入口

### 改动文件
- `medical-ui/src/pages/EvaluationPage.tsx` — 数据集列表增加"运行评测"按钮

### 具体需求

1. **数据集列表操作列**：
   - 增加「运行评测」按钮
   - 点击后弹出确认 Modal：
     - 选择 Schema 版本（下拉，从 /api/schemas 获取）
     - 显示样本数量
     - 「确认运行」按钮
   - 调用后端 API 创建 EvaluationRun

2. **后端**（如果缺少运行 API）：
   - `POST /evaluation/runs` — 创建评测运行
   - 请求体：`{ datasetId, schemaVersionId }`
   - 返回创建的 EvaluationRun 记录

3. **运行记录 Tab**：
   - 显示评测运行列表
   - 列：数据集名称、Schema 版本、状态、开始时间、完成时间、操作
   - 状态 Tag：排队中（蓝）、运行中（橙）、已完成（绿）、失败（红）

---

## 任务 6：任务列表列数据修复

### 改动文件
- `medical-ui/src/pages/JobListPage.tsx` — 隐藏无数据列 + 创建人显示名称

### 具体需求

1. **隐藏全 `-` 的列**：
   - 如果某一列所有行都是 `-`，隐藏该列
   - 特别是：整体置信度、需复核（如果后端没返回数据）

2. **创建人显示名称**：
   - 后端返回的 `createdById` 是用户 ID
   - 需要后端 JOIN User 表返回 `createdByName`
   - 如果为空显示 `-`

3. **Provider 列**：
   - 如果任务没有记录 Provider，显示 `-`
   - 不需要隐藏此列（有些任务有 Provider）

---

## 任务 7：构建验证 + 部署

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

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE6-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **构建验证** — 前端 build 是否通过
3. **测试验证** — 后端测试通过数
4. **UI 验证** — 用浏览器实际检查每个修复点
5. **代码质量** — 无硬编码、无 console.error 残留
6. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 6: P0/P1 核心缺陷修复 - Provider分类/Schema启用/全局Toast/审计中文化/评测入口" && git push` 提交。
