# Medical Record Agent

医疗 OCR 识别系统，将纸质病历转化为结构化电子数据。基于 TypeScript monorepo 架构，支持病历图片、PDF、扫描件的智能识别与结构化字段抽取。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19 + Arco Design + Vite + TanStack Query |
| 后端 | Fastify 5 + TypeScript |
| 数据库 | Prisma ORM（PostgreSQL） |
| 认证 | JWT + HttpOnly Cookie |
| 测试 | Vitest |

## 快速开始

```bash
# 安装依赖
corepack enable && corepack pnpm install

# 启动开发服务
corepack pnpm --filter @medical-record-agent/api dev          # 后端 :3000
corepack pnpm --filter @medical-record-agent/web dev            # 前端 :5173

# 构建
corepack pnpm --filter @medical-record-agent/web build
```

## 测试

```bash
corepack pnpm exec prisma generate                                 # 首次安装或 schema 变化后生成 Prisma Client
corepack pnpm typecheck                                             # 类型检查
corepack pnpm test                                                   # 单元测试；真实 E2E 需要先启动本地 API
corepack pnpm --filter @medical-record-agent/web test                # 前端组件/工具测试
corepack pnpm --filter @medical-record-agent/web build               # 前端构建
corepack pnpm readiness:deployment                                   # 部署就绪检查
corepack pnpm e2e:web:browser                                        # 浏览器 E2E 测试（browserE2E=passed / blocked）
```

## 项目结构

```
Medical-Record-Agent/
├── apps/
│   ├── api/          # Fastify 后端服务
│   ├── web/          # React 前端
├── packages/
│   ├── core/         # 识别工作流与 provider 抽象
│   └── shared/       # 共享类型与 fixtures
├── docs/             # 项目文档
└── scripts/          # 脚本工具
```

## 当前状态

- 类型检查和构建以 `pnpm typecheck`、`pnpm build` 为准。
- `pnpm test` 包含需要本地 API 服务的真实 E2E；未启动 `http://localhost:3000` 时这些用例会拒连。
- 后端服务默认运行在端口 **3000**，前端开发服务默认运行在端口 **5173**。
- 详细交接文档见 [HANDOVER.md](./HANDOVER.md)

## 安全

- CSP 安全头已启用
- HttpOnly Cookie 认证，防止 XSS 窃取 Token
- Rate limiting 覆盖登录与写回接口
- 详见 `apps/api/src/middleware/`
