你是医疗系统的后端工程师。修复 /tmp/Medical-Record-Agent 项目中 9 个失败的集成测试。

## 背景
运行 `npx vitest run apps/api/src/integration/api-e2e.integration.test.ts` 会发现 9 个失败用例。

## 需要修复的 9 个问题

### 1. afterAll 清理
apps/api/src/integration/api-e2e.integration.test.ts 已导入 afterAll，需要在 beforeAll 之后添加 afterAll 钩子，通过 API 或直接 SQL 清理 key LIKE 'test-%' 的 ProviderConfig。

### 2. DELETE /providers/:key 返回 500
apps/api/src/services/api-services.ts 的 deleteProvider 方法，当 provider 不存在或已删除时，Prisma 抛未捕获异常。添加检查：如果 provider 不存在，返回 { deleted: false } 或合适的错误。

### 3. POST /jobs with sourceFileId 返回 404
测试通过 POST /files 只创建元数据，但 job 创建时 enrichDocumentFromStoredFile 尝试 storageProvider.get() 失败。
修复测试：POST /files 时传入 contentBase64 字段（一个简单的 base64 编码的小 PNG 或 PDF）。

### 4-5. GET /knowledge 返回 {entries} 而非 {items}
apps/api/src/routes/knowledge.routes.ts 返回 `{ entries, total }`。
改为返回 `{ items, total }` 与其他列表 API 一致。

### 6. GET /stats/trends 返回 404
apps/api/src/routes/stats.routes.ts 注册的是 `/stats/trend`（单数）。
改测试请求路径从 `/stats/trends` 为 `/stats/trend`。

### 7. POST /writeback missing confirmed → 409 而非 400
apps/api/src/routes/writeback.routes.ts 逻辑顺序问题：先检查 confirmed 再做 Zod 校验。
调整：先做 Zod 校验，失败直接返回 400。

### 8. Security referrer-policy 冲突
apps/api/src/server.ts 的 createSecurityHeaders() 设置 referrer-policy: no-referrer。
apps/api/src/middleware/security.middleware.ts 的 registerSecurityHeaders() 设置 strict-origin-when-cross-origin。
移除 server.ts 中 createSecurityHeaders 里的 referrer-policy 行，统一由 middleware 管理。

### 9. Secret refs masking 测试逻辑缺陷
测试遍历 provider 列表检查 secretRefs 脱敏，但 {} 的 provider 不执行断言。
修改测试：添加一个额外断言，确保至少有一个 provider 的 secretRefs 非空（可以检查数据库中是否有 provider 的 secretRefs 不为 {}）。

## 验证
修复后运行：
```bash
cd /tmp/Medical-Record-Agent && npx vitest run apps/api/src/integration/api-e2e.integration.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|Tests|FAIL"
```
目标：9 failed → 0 failed。

然后运行全部单元测试：
```bash
cd /tmp/Medical-Record-Agent && npx vitest run --exclude='**/integration/**' 2>&1 | tail -5
```

最后前端构建：
```bash
cd /tmp/Medical-Record-Agent/medical-ui && npm run build 2>&1 | tail -5
```

## 输出
将修复报告写入 /tmp/Medical-Record-Agent/E2E-FIX-REPORT.md。

【重要】不要问问题，直接修改代码并运行测试验证。
