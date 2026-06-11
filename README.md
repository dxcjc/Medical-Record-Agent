# Medical Record Agent

医疗 OCR 识别系统，将纸质病历转化为结构化电子数据。基于 TypeScript monorepo 架构，支持病历图片、PDF、扫描件的智能识别与结构化字段抽取。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + Arco Design + Vite |
| 后端 | Fastify + TypeScript |
| 数据库 | Prisma ORM（SQLite / PostgreSQL） |
| 认证 | JWT + HttpOnly Cookie |
| 测试 | Vitest |

## 快速开始

```bash
# 安装依赖
corepack enable && corepack pnpm install

# 启动开发服务
corepack pnpm --filter @medical-record-agent/api dev          # 后端 :9901
corepack pnpm --filter @medical-record-agent/demo-web dev     # 前端 :5173

# 构建
corepack pnpm --filter @medical-record-agent/demo-web build
```

## 测试

```bash
corepack pnpm typecheck                                             # 类型检查
corepack pnpm test                                                   # 单元测试
corepack pnpm --filter @medical-record-agent/demo-web test:styles    # 样式测试
corepack pnpm --filter @medical-record-agent/demo-web test:mobile    # 移动端测试
corepack pnpm readiness:deployment                                   # 部署就绪检查
corepack pnpm e2e:demo-web:browser                                 # 浏览器 E2E 测试（browserE2E=passed / blocked）
```

## 项目结构

```
Medical-Record-Agent/
├── apps/
│   ├── api/          # Fastify 后端服务
│   └── demo-web/     # React 前端
├── packages/
│   ├── shared/       # 共享类型与工具
│   └── ui/           # UI 组件库
├── docs/             # 项目文档
└── scripts/          # 脚本工具
```

## 当前状态

- 本地验证全部通过（typecheck、test、build、styles、mobile、E2E、smoke）
- 后端服务运行在端口 **9901**
- 详细交接文档见 [HANDOVER.md](./HANDOVER.md)

## 安全

- CSP 安全头已启用
- HttpOnly Cookie 认证，防止 XSS 窃取 Token
- Rate limiting 覆盖登录与写回接口
- 详见 `apps/api/src/middleware/`
