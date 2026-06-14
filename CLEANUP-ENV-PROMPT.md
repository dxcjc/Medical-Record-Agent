# 任务：彻底删除 ENV Provider 和 Mock 逻辑

## 背景
这是一个真实的医疗病历识别系统，已有完整的数据库 Provider 管理（admin UI + Prisma）。代码中残留的 ENV-based provider 解析和 mock 逻辑是早期 MVP 遗留，必须彻底删除。

## 要修改的文件

### 1. `apps/api/src/bootstrap/production-services.ts`

**删除 `getConfiguredOcrProviderKey` 和 `getConfiguredModelProviderKey` 函数**（约行 1389-1399）
- 这两个函数直接返回 undefined，因为 provider 全部从数据库读取
- 保留函数签名但直接 `return undefined`

**删除 `createProviderRegistry` 中的 environmentProviders 构建**（约行 1998-2088）
- 删除 OCR 环境 provider 构建（`env.providers.ocr.provider === "http"` 分支）
- 删除 LLM 环境 provider 构建（`env.providers.llm.provider !== "none"` 分支）
- 删除 LIMS 环境 provider 构建（`env.lims.baseUrl` 分支）
- 删除 S3 storage 环境 provider 构建（`env.storage.driver === "s3"` 分支）
- 删除 local storage 环境 provider 构建（`env.storage.driver === "local"` 分支）
- `environmentProviders` 设为空数组 `[]`
- 删除 `environmentProviderKeys` 相关逻辑（`ENV_PROVIDER_NOT_EDITABLE` 检查）

**删除 `buildOcrProvider` 函数**（如果存在且仅用于 ENV 路径）
**删除 `buildModelProvider` 函数**（如果存在且仅用于 ENV 路径）

**修改 `resolveProductionProviderRuntime`**（约行 1651-1725）
- 删除 `configuredOcrProviderKey` 和 `configuredModelProviderKey` 的使用
- provider 只从数据库 `findDefaultSavedProviderKey` 获取
- 简化逻辑：直接从 DB 查找 → 找不到就返回 `{ available: false }`

### 2. `apps/api/src/config/env.ts`

**删除以下环境变量 schema 字段**：
- `OCR_PROVIDER`
- `OCR_ENDPOINT`
- `OCR_API_KEY`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `OPENAI_API_KEY`

**保留**：
- `API_SERVICE_MODE`
- `PORT`, `HOST`
- `VOLCES_API_KEY`（作为 secret resolver 的 env 来源）
- `S3_*`（S3 配置）
- `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`
- `LIMS_*`（如果有）
- `SECRET_RESOLVER_PROVIDER`
- 其他基础设施配置

**删除相关的 superRefine 验证逻辑**（OCR_PROVIDER=http 时必须 OCR_ENDPOINT 等）

**更新 `ProductionEnv` 类型**，移除 `providers.ocr` 和 `providers.llm` 中从 env 读取的字段

### 3. `apps/api/.env`

**清理为只保留基础设施配置**：
```
API_SERVICE_MODE=production
PORT=3000
HOST=0.0.0.0
VOLCES_API_KEY=54d69b29-bbb6-4cc9-b7ff-48d825cdc070
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=./storage
```

删除所有 OCR_PROVIDER、LLM_PROVIDER、LLM_MODEL、LLM_BASE_URL、LLM_API_KEY 相关行。

### 4. `apps/api/src/integration/api-e2e.integration.test.ts`

**修复测试数据清理**：
- `beforeAll` 和 `afterAll` 中的 psql 清理命令改为直接用 Prisma：
  ```typescript
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.providerConfig.deleteMany({ where: { key: { startsWith: "test-" } } });
  await prisma.$disconnect();
  ```
- 确保 `beforeAll` 在测试开始前清理残留数据
- 确保 `afterAll` 在测试结束后清理测试创建的数据

## 约束
- 不要删除 storage driver 相关的 env 逻辑（STORAGE_DRIVER, LOCAL_STORAGE_DIR, S3_*），这些是基础设施配置，不是 provider 管理
- 不要删除 LIMS 相关的 env 逻辑（如果有独立的 LIMS 配置不是通过 provider 管理的）
- `VOLCES_API_KEY` 等 secret 必须保留，它们是 secret resolver 的 env 来源
- 修改后运行 `npx vitest run` 确保所有测试通过
- 如果有 TypeScript 编译错误，修复它们

## 验证
修改完成后：
1. `npx vitest run` 全部通过
2. 服务器可以在不设置 OCR_PROVIDER/LLM_PROVIDER 环境变量的情况下正常启动
3. Provider 完全从数据库读取
