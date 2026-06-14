# Phase 12: 环境变量→数据库统一（增量方案）

## 策略
不删除 env.ts 中的类型定义，而是：
1. 让业务配置 env 变为可选（不是 required）
2. 启动时优先从数据库 ProviderConfig 读取
3. 只有数据库没有时才 fallback 到 env
4. 最终从 .env 移除业务配置

## Step 1: 修改 env.ts — 业务配置变可选
将以下字段从 required 改为 optional（加 `.optional()`）：
- `OCR_PROVIDER`, `OCR_ENDPOINT`, `OCR_API_KEY`
- `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `OPENAI_API_KEY`
- `LIMS_BASE_URL`, `LIMS_CLINICAL_INFO_ENDPOINT`, `LIMS_API_TOKEN`, `LIMS_TIMEOUT_MS`
- `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`, `S3_*`
- `CORS_ORIGINS`

同时在 `checkedEnvSchema` superRefine 中，只在对应 env 变量有值时才校验依赖关系。

## Step 2: 在 production-services.ts 加载数据库配置
在启动入口处，查询 active 的 ProviderConfig：
```ts
const dbConfigs = await prisma.providerConfig.findMany({ where: { status: 'active' } });
```

提取各 kind 的配置：
```ts
const ocrConfig = dbConfigs.find(c => c.kind === 'ocr');
const llmConfig = dbConfigs.find(c => c.kind === 'llm');
const limsConfig = dbConfigs.find(c => c.kind === 'lims');
const storageConfig = dbConfigs.find(c => c.kind === 'storage');
```

## Step 3: 修改 buildOcrProvider / buildModelProvider
增加数据库配置优先逻辑：
```ts
function buildOcrProvider(env: ProductionEnv, dbConfig?: ProviderConfigRecord, runtimeOptions?) {
  // 优先用 dbConfig，fallback 到 env
  const provider = dbConfig?.config?.provider ?? env.providers.ocr.provider;
  const endpoint = dbConfig?.config?.endpoint ?? env.providers.ocr.endpoint;
  const apiKey = dbConfig?.secretRefs?.apiKey ?? env.providers.ocr.apiKey;
  // ...
}
```

## Step 4: 清理 .env
只保留：
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medical_record_agent?schema=public
PORT=3000
HOST=0.0.0.0
API_SERVICE_MODE=production
JWT_SECRET=medical-dev-jwt-secret-20260612-secure-key
```

## Step 5: 创建缺失的 OCR ProviderConfig
```sql
INSERT INTO "ProviderConfig" (id, key, kind, "displayName", status, "isDefault", config, "secretRefs", "createdAt", "updatedAt")
VALUES (
  'ocr-paddle-http',
  'paddleocr-http',
  'ocr',
  'PaddleOCR 本地服务',
  'active',
  true,
  '{"provider": "http", "endpoint": "http://127.0.0.1:8866/ocr", "timeoutMs": 30000}',
  '{}',
  NOW(),
  NOW()
);
```

## 关键约束
1. 测试不能破坏 — env vars 仍可传入用于测试
2. 数据库配置优先级高于 env
3. 类型定义（AppEnv, ProductionEnv）保持向后兼容

## 验证
1. `npm test` 全部通过
2. 清理 .env 后重启 API 能正常工作
3. Provider 页面显示正确配置
