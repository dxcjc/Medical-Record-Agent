# 任务：修复 production-services.test.ts 中所有失败测试

## 背景
已从 production-services.ts 删除所有 ENV-based provider 逻辑。Provider 现在只从数据库读取。
测试文件还在用 env.providers.ocr / env.providers.llm 设置测试，需要全部改为数据库 provider。

## 当前状态
- `getConfiguredOcrProviderKey()` → 直接返回 undefined
- `getConfiguredModelProviderKey()` → 直接返回 undefined
- `createProviderRegistry` 中 environmentProviders = []
- `buildOcrProvider`/`buildModelProvider` 已删除

## 修改模式

### 原来的测试写法：
```typescript
env.providers.ocr = { provider: "http", endpoint: "http://ocr.test/api", apiKey: "test-key" };
```

### 改为在 mock prisma 中注入数据库 provider：
在测试的 beforeEach 或 mockPrisma 设置中，确保 providerConfig.findMany/findUnique 返回：
```typescript
{
  key: "test-ocr",
  kind: "ocr",
  status: "active",
  isDefault: true,
  displayName: "Test OCR",
  config: { provider: "http", endpoint: "http://ocr.test/api" },
  secretRefs: { apiKey: "test-key" },
  id: "test-id",
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedById: null
}
```

### 健康检查测试
健康检查现在从数据库 provider 的 config.endpoint 读取 URL，从 secretRefs 解析 apiKey。
需要确保 mock providerRepository.findByKey 返回正确的记录。

### LIMS 测试
LIMS 写回测试也需要从数据库 provider 读取配置，不再依赖 env.lims。

## 验证
运行 `npx vitest run apps/api/src/bootstrap/production-services.test.ts` 确保所有测试通过。
然后运行 `npx vitest run` 确保全量测试通过。
