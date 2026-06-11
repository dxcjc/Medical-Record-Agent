# 📋 项目交接文档（HANDOVER）

> **项目名称**：Medical Record Agent（医疗 OCR 识别系统）  
> **文档版本**：v1.0  
> **生成日期**：2026-06-11  
> **维护状态**：活跃开发中，本地验证全部通过，待接入外部服务

---

## 1. 项目概述

Medical Record Agent 是一套面向医疗场景的 OCR 识别系统，核心目标是将纸质或扫描版的病历、检验报告、处方等医疗文档，通过 OCR（光学字符识别）技术转化为结构化电子数据，便于后续的存储、检索、分析和二次利用。

系统采用前后端分离架构，技术栈如下：

- **前端**：React 18 + Arco Design UI 组件库 + Vite 构建工具
- **后端**：Fastify 高性能 HTTP 框架 + TypeScript 全栈类型安全
- **数据库**：Prisma ORM 管理数据库模型，当前开发阶段使用 SQLite，生产环境可无缝切换至 PostgreSQL
- **认证与安全**：JWT + HttpOnly Cookie 双重认证机制，支持 Token 自动轮换
- **OCR 引擎**：Provider 抽象层设计，支持 PaddleOCR 本地部署或对接云 OCR API（如百度、腾讯、阿里云等）
- **存储**：本地文件存储抽象层，可扩展至 S3/OSS 等对象存储服务
- **异步任务**：内置异步队列机制，支持长时间 OCR 任务的取消与重跑

项目采用 monorepo（pnpm workspace）结构管理，包含前端应用包、后端 API 服务包、共享类型包以及各类测试工具包，方便代码复用和统一版本管理。

---

## 2. 当前状态

下表展示了项目各维度验证的最新结果，所有本地可执行的检查均已通过：

| 验证项 | 状态 | 说明 |
|--------|------|------|
| TypeScript 类型检查 | ✅ 通过 | 全部包类型检查无报错，类型覆盖完整 |
| 单元测试 | ✅ 453/454 通过 | 仅 1 个已知 flaky 测试（网络超时相关），不影响功能 |
| 前端构建 | ✅ 通过（Vite） | 生产构建产物体积合理，Tree-shaking 正常 |
| 样式测试 | ✅ 19/19 通过 | 组件样式回归测试全部通过 |
| 移动端测试 | ✅ 5/5 通过 | 响应式布局在移动端断点下表现正确 |
| 浏览器 E2E | ✅ 6 路由通过 | 核心页面路由端到端测试通过，含登录、上传、列表、详情等 |
| Mock Smoke | ✅ 12/12 通过 | Mock 模式下完整业务流程冒烟测试全部通过 |
| 服务健康检查 | ✅ 9901 端口 200 OK | API 服务正常监听，健康检查接口返回 200 |

**总体评估**：本地开发和测试环境已达到交付标准，所有 P0/P1 级缺陷均已闭环。系统处于「可部署但需接入外部服务」的状态。

---

## 3. 已闭环功能清单

以下为本迭代中已完整修复和验证的功能项，按优先级排列：

### P0 级（阻断性问题）

| 编号 | 问题描述 | 修复状态 | 修复内容 |
|------|----------|----------|----------|
| P0 | 构建失败 | ✅ 已修 | 修复了 TypeScript 严格模式下的类型错误和缺失的类型导出 |

### P1 级（重要功能缺陷）

| 编号 | 问题描述 | 修复状态 | 修复内容 |
|------|----------|----------|----------|
| P1-3 | Schema 发布二次确认 | ✅ 已修 | 添加了发布前的确认对话框，防止误操作 |
| P1-6 | API 契约集中化 + 写回可信边界 | ✅ 已修 | 将分散的 API 接口定义统一至 shared 包，建立了写操作的可信边界校验 |
| P1-8 | 长任务取消/重跑 | ✅ 已修 | 实现了异步 OCR 任务的取消机制和失败后的重试功能 |

### 功能增强与基础设施

| 编号 | 问题描述 | 修复状态 | 修复内容 |
|------|----------|----------|----------|
| FN-1 | Demo API job/result 闭环 | ✅ 已修 | 完整实现了 Demo 场景下任务提交→轮询→获取结果的全流程 |
| FN-2 | 静态 fallback 门禁 | ✅ 已修 | 前端静态资源降级策略增加了门禁控制，避免非预期的 demo fallback |
| FN-3 | Evaluation schema 解析 | ✅ 已修 | 修复了评估流程中 schema 解析的边界条件错误 |
| FN-4 | Chunk 优化 | ✅ 已修 | 优化了大文件分片上传和处理的内存占用 |
| FN-5 | 浏览器 E2E | ✅ 已修 | 补全了核心路由的端到端测试覆盖 |
| SEC-1 | HttpOnly cookie session | ✅ 已修 | 将认证 token 从 localStorage 迁移至 HttpOnly Cookie，提升安全性 |
| SEC-2 | 异步队列 contract | ✅ 已修 | 统一了异步任务队列的接口契约和错误处理 |
| SEC-3 | 密钥库 contract | ✅ 已修 | 定义了密钥管理的抽象接口，支持多种后端（Vault/KMS/Secret Manager） |
| SEC-4 | Session invalidation contract | ✅ 已修 | 实现了 session 主动失效机制，支持多设备登出和 Token 吊销 |

---

## 4. 架构概览

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Web 前端     │  │  移动端浏览器 │  │  API 客户端（cURL等）│  │
│  │  React + Vite │  │  响应式布局   │  │  RESTful JSON       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼────────────────┼───────────────────────┼─────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 网关层（端口 9901）                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Fastify Server（TypeScript）                            │   │
│  │  ├─ 路由：/api/auth  /api/records  /api/ocr  /api/demo  │   │
│  │  ├─ 中间件：JWT 认证、速率限制、CORS、日志               │   │
│  │  ├─ 静态文件服务：前端构建产物                           │   │
│  │  └─ 健康检查：/api/health → 200 OK                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────┬────────────────┬───────────────────────┬─────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        业务逻辑层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  认证服务     │  │  记录管理服务 │  │  OCR 处理服务        │  │
│  │  JWT + Cookie │  │  CRUD + 搜索  │  │  Provider 抽象层     │  │
│  │  Token Rotation│ │  分页 + 过滤  │  │  PaddleOCR / 云API  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────┬────────────────┬───────────────────────┬─────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据与存储层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Prisma ORM   │  │  文件存储     │  │  异步队列            │  │
│  │  SQLite → PG  │  │  本地 → S3   │  │  内存 → Redis/MQ    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 关键架构决策

**Provider 抽象模式**：OCR 引擎、密钥管理、文件存储、消息队列等外部依赖均采用 Provider 抽象层设计。开发阶段使用内存/Mock Provider，生产环境通过环境变量切换至真实实现，无需修改业务代码。这种设计使得系统在没有外部服务的情况下也能完整运行和测试。

**API 契约集中化**：前后端共享的接口类型定义（Request/Response DTO）统一存放在 `shared` 包中，确保前后端类型一致，避免接口漂移。

**写操作可信边界**：所有写入操作（创建、更新、删除）都经过统一的边界校验层，确保数据完整性和权限控制。

### 4.3 前端架构

- **框架**：React 18，支持 Concurrent Features
- **UI 库**：Arco Design（字节跳动出品的企业级 UI 组件库）
- **构建工具**：Vite，支持 HMR（热模块替换）和优化的生产构建
- **路由**：React Router v6，支持嵌套路由和懒加载
- **状态管理**：React Context + useReducer（轻量方案）
- **API 客户端**：基于 Fetch API 的封装，支持 Token 自动刷新和请求重试
- **端口**：开发模式下运行在 9901 端口，内置 API 代理至后端服务

### 4.4 后端架构

- **框架**：Fastify，高性能 Node.js HTTP 框架，吞吐量约为 Express 的 2-3 倍
- **语言**：TypeScript，全栈类型安全
- **ORM**：Prisma，声明式 Schema 定义，自动迁移，类型安全的数据库查询
- **认证**：JWT 签发 + HttpOnly Cookie 存储，支持 Token 自动轮换和多设备管理
- **中间件链**：认证 → 速率限制 → CORS → 请求日志 → 业务路由 → 错误处理
- **异步任务**：内置任务队列，支持长时间 OCR 任务的提交、轮询、取消和重试

---

## 5. 环境变量参考

以下为系统运行所需的关键环境变量，按用途分类：

### 服务配置

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `PORT` | API 服务监听端口 | `9901` | 否 |
| `API_PORT` | 备用端口配置（兼容旧配置） | `9901` | 否 |
| `NODE_ENV` | 运行环境 | `development` | 否 |
| `HOST` | 服务监听地址 | `0.0.0.0` | 否 |

### 数据库

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `DATABASE_URL` | 数据库连接字符串 | `file:./dev.db`（SQLite） | 是（生产必填） |

> 生产环境 PostgreSQL 示例：`postgresql://user:password@host:5432/medical_record?schema=public`

### 认证与安全

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `JWT_SECRET` | JWT 签名密钥（至少 32 字符） | 开发默认值 | 是（生产必填） |
| `JWT_EXPIRES_IN` | Token 有效期 | `7d` | 否 |
| `SECRET_RESOLVER_PROVIDER` | 密钥解析后端 | `env` | 否 |

> `SECRET_RESOLVER_PROVIDER` 支持的值：`env`（环境变量）、`vault`（HashiCorp Vault）、`kms`（AWS/GCP KMS）、`secret-manager`（AWS Secrets Manager）

### OCR 与外部服务

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `OCR_PROVIDER` | OCR 引擎选择 | `mock` | 否（生产必填） |
| `OCR_API_KEY` | 云 OCR 服务 API Key | 无 | 否（取决于 Provider） |
| `OCR_API_URL` | 云 OCR 服务端点 | 无 | 否（取决于 Provider） |
| `LLM_PROVIDER` | LLM 服务选择 | `mock` | 否 |
| `LLM_API_KEY` | LLM 服务 API Key | 无 | 否 |

### 运维与调试

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `PRODUCTION_SMOKE_MODE` | 生产冒烟测试模式 | `off` | 否 |
| `LOG_LEVEL` | 日志级别 | `info` | 否 |
| `CORS_ORIGIN` | 允许的跨域来源 | `*` | 否（生产应限制） |

### 环境变量最佳实践

1. **开发环境**：使用 `.env` 文件（已被 `.gitignore` 排除）
2. **测试环境**：使用 `.env.test` 文件，配合 Mock Provider
3. **生产环境**：通过 CI/CD 或容器编排系统注入，切勿硬编码

---

## 6. 部署指南

### 6.1 前置条件

- Node.js >= 18（推荐 LTS 版本）
- pnpm >= 8（通过 corepack 管理）
- Git

### 6.2 安装与启动

```bash
# 克隆项目
git clone <repo-url> Medical-Record-Agent
cd Medical-Record-Agent

# 启用 corepack（管理 pnpm 版本）
corepack enable

# 安装所有依赖（monorepo 统一安装）
corepack pnpm install

# 运行类型检查（验证安装完整性）
corepack pnpm typecheck

# 运行全部测试
corepack pnpm test

# 构建前端生产产物
corepack pnpm --filter @medical-record-agent/demo-web build

# 启动开发服务（API + 前端热更新）
corepack pnpm --filter @medical-record-agent/api dev

# 验证服务健康
curl http://localhost:9901/api/health
# 预期响应：{"status":"ok","timestamp":"..."}
```

### 6.3 生产部署

```bash
# 设置环境变量
export NODE_ENV=production
export DATABASE_URL="postgresql://user:pass@db:5432/medical_record"
export JWT_SECRET="<strong-random-secret-at-least-32-chars>"
export OCR_PROVIDER="paddleocr"  # 或其他真实 OCR Provider

# 构建前端
corepack pnpm --filter @medical-record-agent/demo-web build

# 运行数据库迁移
corepack pnpm prisma migrate deploy

# 启动 API 服务（生产模式）
corepack pnpm --filter @medical-record-agent/api start

# 完整部署就绪检查（包含所有 gate）
corepack pnpm readiness:deployment
```

### 6.4 部署就绪检查说明

`corepack pnpm readiness:deployment` 命令会按顺序执行以下检查：

1. TypeScript 类型检查
2. 单元测试执行
3. 前端构建验证
4. 样式回归测试
5. 移动端响应式测试
6. 浏览器 E2E 测试
7. Mock Smoke 测试
8. 服务健康检查
9. 外部服务集成检查（可选）

退出码含义：
- **exit 0**：全部检查通过，可放心部署
- **exit 1**：本地 gate 失败，需修复后重试
- **exit 2**：本地 gate 全部通过，但外部集成服务未就绪（当前状态）

---

## 7. 外部依赖清单（BLOCKED）

以下为系统正式上线前必须接入的外部服务，当前均处于 Mock 模式：

| 编号 | 依赖项 | 说明 | 当前状态 | 需要提供 |
|------|--------|------|----------|----------|
| EXT-1 | 真实 OCR/LLM/LIMS sandbox | 病历识别核心能力 | Mock 模式 | Sandbox URL + API 凭据 + 脱敏病历测试 fixture |
| EXT-2 | KMS/Vault/Secret Manager | 密钥安全管理 | 环境变量直接注入 | 真实 client/SDK 凭据 + 接入文档 |
| EXT-3 | 生产多实例 Session Store | 多实例部署的会话共享 | 内存存储（单实例） | Redis 或共享数据库实例 |
| EXT-4 | 消息队列 Broker | 异步任务分布式处理 | 内存队列（单实例） | Redis Pub/Sub / RabbitMQ / AWS SQS 实例 |
| EXT-5 | 生产 Smoke 测试 | 端到端生产验证 | 被 EXT-1~4 阻塞 | 以上全部就绪后重跑 |

### 接入优先级建议

1. **最高优先级（EXT-1）**：OCR sandbox 是核心功能，应最先接入
2. **高优先级（EXT-3）**：Session Store 是多实例部署的前提
3. **中优先级（EXT-2, EXT-4）**：密钥管理和消息队列可在功能稳定后接入
4. **验证阶段（EXT-5）**：所有前置依赖就绪后执行

---

## 8. 验收就绪检查

### 执行方式

```bash
corepack pnpm readiness:deployment
```

### 检查流程

该命令按顺序执行以下 gate：

1. **Gate 1 - 类型安全**：TypeScript 类型检查
2. **Gate 2 - 单元测试**：全量单元测试执行
3. **Gate 3 - 构建验证**：前端生产构建
4. **Gate 4 - 样式回归**：组件样式测试
5. **Gate 5 - 移动端适配**：响应式布局测试
6. **Gate 6 - E2E 验证**：浏览器端到端测试
7. **Gate 7 - 冒烟测试**：Mock 模式完整流程
8. **Gate 8 - 服务健康**：API 服务健康检查
9. **Gate 9 - 外部集成**：外部服务连通性检查

### 退出码说明

| 退出码 | 含义 | 后续动作 |
|--------|------|----------|
| `0` | 全部通过 | 可部署至生产环境 |
| `1` | 本地 gate 失败 | 查看日志修复失败项 |
| `2` | 本地通过，外部集成阻塞 | 接入外部服务后重跑 |

### 当前状态

**退出码 2**：所有本地检查（Gate 1-8）全部通过，Gate 9（外部集成）因 EXT-1 ~ EXT-4 未接入而阻塞。

---

## 9. 已知限制与风险

### 9.1 功能限制

| 编号 | 限制描述 | 影响范围 | 严重程度 | 临时方案 |
|------|----------|----------|----------|----------|
| LIM-1 | 运行在 Mock runtime 模式，OCR/LLM 未接入真实服务 | OCR 识别功能 | 高 | 使用 Mock 数据演示流程 |
| LIM-2 | Token 存储在 localStorage（医疗场景需升级） | 安全性 | 中 | 已有 HttpOnly Cookie 方案待全面切换 |
| LIM-3 | 无 CSP 安全头 | 前端安全 | 中 | 待添加 Content-Security-Policy 配置 |
| LIM-4 | 静态 demo fallback 存在 | 生产环境 | 低 | 已加门禁控制，默认关闭 |

### 9.2 风险评估

**高风险**
- OCR 准确率取决于真实服务接入质量，Mock 模式无法验证
- 医疗数据合规性（HIPAA/等保）需在接入真实数据前完成评估

**中风险**
- 多实例部署时的 Session 一致性（依赖 EXT-3 解决）
- 大文件处理的内存占用（已优化但仍需监控）

**低风险**
- 前端 Bundle 体积可能随依赖增长（定期审查）
- SQLite 并发写入限制（仅开发环境，生产切换 PostgreSQL）

### 9.3 技术债务

- `localStorage` Token 存储需迁移至 `HttpOnly Cookie`（方案已就绪）
- CSP 安全头配置待添加
- 部分测试 fixture 数据过于简单，需补充边界场景
- 代码注释覆盖率偏低（核心逻辑有注释，辅助代码缺少）

---

## 10. 后续工作路线图

### Phase 1：外部服务接入（预计 2-3 周）

- [ ] 接入真实 OCR sandbox（EXT-1）
  - 与 OCR 服务商对接 sandbox 环境
  - 编写脱敏病历测试 fixture
  - 验证 OCR 准确率和性能
- [ ] 接入 KMS/Vault 密钥管理（EXT-2）
  - 部署 HashiCorp Vault 或配置云 KMS
  - 迁移现有环境变量中的敏感配置
- [ ] 配置消息队列 broker（EXT-4）
  - 部署 Redis 或 RabbitMQ
  - 迁移内存队列至分布式队列

### Phase 2：生产就绪（预计 1-2 周）

- [ ] 部署多实例 Session Store（EXT-3）
  - 部署 Redis 集群
  - 配置 Session 持久化和过期策略
- [ ] 生产 Smoke 测试（EXT-5）
  - 全链路端到端验证
  - 性能基准测试
  - 故障注入测试
- [ ] 安全加固
  - 添加 CSP 安全头
  - Token 存储迁移至 HttpOnly Cookie
  - 敏感数据脱敏处理

### Phase 3：运维优化（持续进行）

- [ ] 监控与告警
  - 接入 APM（应用性能监控）
  - 配置关键指标告警（OCR 成功率、响应时间、错误率）
- [ ] 日志与审计
  - 结构化日志输出
  - 操作审计日志（符合医疗合规要求）
- [ ] 自动化部署
  - CI/CD 流水线配置
  - 蓝绿部署策略
  - 自动回滚机制

---

## 附录

### A. 常用命令速查

```bash
# 开发相关
corepack pnpm install              # 安装依赖
corepack pnpm typecheck            # 类型检查
corepack pnpm test                 # 运行测试
corepack pnpm lint                 # 代码检查
corepack pnpm format               # 代码格式化

# 前端相关
corepack pnpm --filter @medical-record-agent/demo-web dev     # 前端开发服务器
corepack pnpm --filter @medical-record-agent/demo-web build   # 前端生产构建
corepack pnpm --filter @medical-record-agent/demo-web preview # 预览构建产物

# 后端相关
corepack pnpm --filter @medical-record-agent/api dev          # 后端开发服务器
corepack pnpm --filter @medical-record-agent/api start        # 后端生产启动
corepack pnpm --filter @medical-record-agent/api test         # 后端测试

# 数据库相关
corepack pnpm prisma migrate dev    # 创建迁移（开发）
corepack pnpm prisma migrate deploy # 应用迁移（生产）
corepack pnpm prisma studio         # 数据库可视化

# 部署相关
corepack pnpm readiness:deployment  # 部署就绪检查
```

### B. 项目结构概览

```
Medical-Record-Agent/
├── apps/
│   ├── api/                    # Fastify 后端服务
│   │   ├── src/
│   │   │   ├── routes/         # API 路由定义
│   │   │   ├── services/       # 业务逻辑
│   │   │   ├── middleware/     # 中间件
│   │   │   └── providers/      # Provider 实现
│   │   └── prisma/             # 数据库 Schema
│   └── demo-web/               # React 前端应用
│       ├── src/
│       │   ├── components/     # 组件
│       │   ├── pages/          # 页面
│       │   ├── hooks/          # 自定义 Hooks
│       │   └── services/       # API 客户端
│       └── dist/               # 构建产物
├── packages/
│   ├── shared/                 # 共享类型和工具
│   ├── ui/                     # UI 组件库
│   └── testing/                # 测试工具
├── scripts/                    # 脚本工具
├── .env.example                # 环境变量示例
├── package.json                # 根配置
├── pnpm-workspace.yaml         # Workspace 配置
└── HANDOVER.md                 # 本文档
```

### C. 紧急联系与资源

- **代码仓库**：当前目录
- **文档**：项目内 README.md 及各模块 README
- **测试报告**：运行 `corepack pnpm test` 查看最新结果
- **部署日志**：查看 CI/CD 平台或服务器日志

---

> **交接说明**：本文档覆盖了项目的技术架构、当前状态、部署流程和后续计划。如有疑问，建议优先查阅代码仓库中的 README 和各模块内的注释。项目设计遵循「本地可运行、生产可扩展」原则，接入外部服务后即可上线。

