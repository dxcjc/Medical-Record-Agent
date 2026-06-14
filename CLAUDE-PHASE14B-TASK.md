# Phase 14B 任务文件：集成测试用例编写

## 目标
编写端到端集成测试，覆盖所有关键 API 端点，发现隐藏 bug。

## 环境信息
- 项目路径：/tmp/Medical-Record-Agent
- 测试框架：vitest（已有 366 个测试）
- 登录账号：admin.dev@example.local / ChangeMe123!
- 数据库：PostgreSQL

## 需要覆盖的测试场景

### 1. 认证流程
- POST /auth/login — 正确密码 → 200 + token
- POST /auth/login — 错误密码 → 401
- 带 token 访问 → 200
- 不带 token 访问 → 401

### 2. Provider CRUD
- GET /providers — 列表包含 DB providers
- POST /providers — 创建新 provider
- PUT /providers/:key — 更新 provider（完整更新）
- PUT /providers/:key — toggle enabled（partial update）
- POST /providers/:key/default — 设为默认
- DELETE /providers/:key — 删除 provider

### 3. Schema 管理
- GET /schemas — 列表
- 停用 schema 后仍然在列表中（状态为 disabled）

### 4. 识别任务全流程
- POST /files — 上传文件，获取 fileId
- POST /jobs — 创建任务（schemaKey + fileIds）
- GET /jobs/:id — 查看任务详情
- GET /results/:id — 查看识别结果

### 5. 评测中心
- POST /evaluations/datasets — 创建数据集
- POST /evaluations/runs — 运行评测
- GET /evaluations/runs/:id/metrics — 查看指标

### 6. 反馈管理
- GET /feedback/all — 列表
- POST /feedback — 提交反馈

### 7. 审计日志
- GET /audit — 列表

## 测试文件位置
新建：apps/api/src/integration/api-e2e.integration.test.ts

## 约束
- 使用 vitest
- 每个测试独立（不依赖其他测试的副作用）
- 使用真实数据库（不是 mock）
- 测试文件名以 .integration.test.ts 结尾
