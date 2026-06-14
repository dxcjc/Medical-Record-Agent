# Phase 5 任务说明 — 遗留项清理

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Phase 1-4 已完成，系统从 Demo 升级为可用产品。还有 4 个遗留项需要清理。

## 核心目标
干掉所有遗留项，做到 0 遗留。

---

## 任务 1：Token refresh 后端实现

### 当前状态
- 前端已实现 401 拦截 → tryRefreshToken → 成功重试/失败跳转
- 后端 `POST /auth/refresh` 端点已创建，但当前返回 501（auth service 未实现）

### 改动文件
- `apps/api/src/services/auth.service.ts` — 实现 verifySessionToken / signSessionToken
- `apps/api/src/routes/auth.routes.ts` — 完善 refresh 端点

### 需求

1. **实现 signSessionToken(payload)**：
   - 使用 JWT 或类似机制签发 access token
   - 过期时间：当前是多少就保持多少（通常是 24h 或更长）
   - 密钥从环境变量读取（如 JWT_SECRET 或已有的密钥配置）

2. **实现 verifySessionToken(token)**：
   - 验证 token 签名和过期时间
   - 返回 payload（userId, email 等）
   - 过期或无效返回 null

3. **完善 POST /auth/refresh**：
   - 从 Authorization header 读取当前 token
   - verifySessionToken 验证（即使过期也要能解析 payload，只验证签名）
   - 签发新 token
   - 返回 `{ accessToken: newToken }`
   - 如果签名无效（不是过期，是被篡改），返回 401

4. **注意**：
   - 查看项目中是否已有 JWT 相关依赖（jsonwebtoken、jose 等）
   - 如果没有，用 Node.js crypto 实现简单的 HMAC token
   - 不要破坏现有的登录流程

---

## 任务 2：修复预存在的测试失败

### 当前状态
4 个测试文件失败，共 11 个测试用例：
- `production-services.test.ts` — providerRuntimeFetch 断言（8 个）
- `llmExtraction.test.ts` — LLM 抽取引擎 schema 校验（1 个）
- `hard-remove-mock-provider-user-surface.test.ts` — 引用已删除文件（1 个）
- `p2-production-handoff.test.ts` — 引用已删除文件（1 个）

### 需求

1. **先运行测试，确认当前失败的具体原因**：
   ```bash
   cd /tmp/Medical-Record-Agent && npx vitest run --reporter=verbose 2>&1 | tail -100
   ```

2. **逐个修复**：
   - `production-services.test.ts`：检查 providerRuntimeFetch 断言是否与实际实现匹配，修复断言
   - `llmExtraction.test.ts`：检查 schema 校验逻辑，修复断言
   - `hard-remove-mock-provider-user-surface.test.ts`：如果引用了已删除的文件，更新引用或删除测试
   - `p2-production-handoff.test.ts`：同上

3. **验收**：所有测试通过，0 失败

---

## 任务 3：评测中心 CSV 上传

### 当前状态
评测中心已有三种导入方式：从识别结果导入、手动录入、JSON 粘贴。
缺少 CSV 上传。

### 改动文件
- `medical-ui/src/pages/EvaluationPage.tsx` — 新增 CSV 上传 Tab

### 需求

1. **新增第四个 Tab：「CSV 上传」**
2. **上传组件**：
   - 使用 Arco 的 Upload 组件
   - 接受 .csv 文件
   - 上传后解析 CSV 内容

3. **CSV 解析**：
   - 第一行为表头（字段名）
   - 后续行为数据
   - 解析后显示预览表格（前 5 行）
   - 用户确认后导入

4. **导入逻辑**：
   - 每行数据创建一个评测样本
   - 字段映射：CSV 列名 → Schema 字段名
   - 如果列名不匹配，显示警告但不阻止导入

5. **错误处理**：
   - 文件格式错误 → toast 提示
   - 编码问题 → 尝试 UTF-8 和 GBK

---

## 任务 4：Schema 版本对比

### 当前状态
Schema 详情页可以查看版本列表，但没有版本对比功能。

### 改动文件
- `medical-ui/src/pages/SchemaPage.tsx` — 新增版本对比功能

### 需求

1. **版本对比入口**：
   - Schema 详情页的版本历史区域
   - 每个版本旁边增加「对比」按钮
   - 点击后与当前活跃版本对比

2. **对比展示**：
   - Modal 或 Drawer 中展示
   - 左侧：旧版本字段列表
   - 右侧：新版本字段列表
   - 差异高亮：
     - 新增字段：绿色背景
     - 删除字段：红色背景 + 删除线
     - 修改字段：黄色背景（类型/描述变化）

3. **实现方式**：
   - 前端纯 JS 对比（不需要后端新 API）
   - 比较 fields 数组的 key/type/description/required

---

## 任务 5：构建验证 + 部署

### 步骤

1. 运行所有测试：
   ```bash
   cd /tmp/Medical-Record-Agent && npx vitest run
   ```

2. 前端构建：
   ```bash
   cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
   ```

3. 重启 API：
   ```bash
   cd /tmp/Medical-Record-Agent && bash start-api.sh
   ```

4. 重载 nginx：
   ```bash
   sudo systemctl reload nginx
   ```

---

## 验收标准

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE5-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **测试验证** — 所有测试通过（0 失败）
3. **构建验证** — 前端 build 是否通过
4. **API 验证** — Token refresh 端点测试
5. **代码质量** — 无硬编码、无 console.error 残留
6. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 5: 遗留项清理 - Token refresh/测试修复/CSV上传/版本对比" && git push` 提交。
