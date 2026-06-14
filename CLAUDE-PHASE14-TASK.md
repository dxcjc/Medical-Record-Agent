# Phase 14 任务文件：全面 Debug

## 环境信息
- API 端口：3000
- 前端端口：9091
- 数据库：PostgreSQL，连接串在 .env 的 DATABASE_URL
- 登录账号：admin.dev@example.local / ChangeMe123!
- 项目路径：/tmp/Medical-Record-Agent
- API 启动命令：cd /tmp/Medical-Record-Agent && bash start-api.sh
- 前端构建：cd /tmp/Medical-Record-Agent/medical-ui && npx vite build

## 当前已确认的 Bug 列表

### Bug 1: Provider toggle 返回 500
- 端点：PUT /providers/paddleocr-http
- 请求体：{"enabled": false}
- 响应：500 {"error":"PROVIDER_ERROR"}
- 根因分析：
  - providers.routes.ts 的 PUT 路由已添加 toggle 支持（检测 isToggleOnly），但代码中调用了 `listProviders()` 然后找 provider
  - listProviders() 返回的对象可能没有 kind/displayName/config 字段（env provider 的结构不同）
  - 需要检查 `dependencies.providerService.listProviders()` 返回的结构
- 修复方向：
  1. 在 createProviderRegistry 的 list() 方法中，确保 env provider 和 DB provider 返回一致的结构
  2. 或者在 toggle 逻辑中处理 env provider（通过 findByKey 从 DB 读取，如果不存在则返回 400 说不支持 toggle env provider）
  3. 最佳方案：env provider 不允许 toggle，只有 DB provider 可以 toggle

### Bug 2: env provider "local-storage" 仍然出现
- 位置：createProviderRegistry() 的 environmentProviders 数组
- 根因：storage provider 的创建是无条件的（line 2051-2067），不像 OCR/LLM/LIMS 有 if 条件判断
- 修复：把 storage provider 也改为条件创建，只在 env vars 显式设置时才创建
- 文件：apps/api/src/bootstrap/production-services.ts

### Bug 3: 文件上传返回格式
- 端点：POST /files
- 前端使用 FormData 上传
- 需要确认 API 返回的文件 ID 路径（可能是 file.id 或 id）

### Bug 4: 新建识别报错（用户反馈）
- 需要复现并查看具体错误
- 可能是 OCR provider 配置问题或 LLM 调用问题

## 修复策略

### Step 1: 修复 env provider 生成逻辑
在 production-services.ts 的 createProviderRegistry 中：
- storage provider 加条件判断，只在 env.storage.driver 非默认值时创建
- 或者：如果 DB 中已有同 kind 的 provider，跳过 env provider

### Step 2: 修复 Provider toggle
- 在 providers.routes.ts 的 toggle 逻辑中，先从 DB 查找 provider
- 如果 provider 只存在于 env（DB 中没有），返回 400 + 明确错误信息
- 如果 provider 在 DB 中存在，正常 toggle

### Step 3: 修复文件上传 + 创建任务
- 确认 /files 和 /jobs 的请求/响应格式
- 修复前端和后端的格式匹配问题

### Step 4: 运行完整测试
- npm test
- 手动 API 测试所有关键端点

## 关键约束
- 不能破坏现有测试
- env provider 必须向后兼容（其他部署可能依赖 env vars）
- 优先修复用户可感知的 bug
