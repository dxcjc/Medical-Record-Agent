# 中低优先级遗留问题修复审计报告

**日期**: 2026-06-14  
**分支**: master  
**基线提交**: 5c53e11

---

## 修复总览

| # | 优先级 | 修复项 | 状态 | 修改文件 |
|---|--------|--------|------|----------|
| 1 | 中 | Prisma错误统一处理中间件 | ✅ | `middleware/prisma-error.middleware.ts` (新建), `server.ts` |
| 2 | 中 | 文件上传后DB失败清理 | ✅ | `services/api-services.ts` |
| 3 | 中 | Session invalidation默认memory模式 | ✅ | `bootstrap/production-services.ts` |
| 4 | 中 | Rate limiter Redis支持 | ✅ | `server.ts` |
| 5 | 中 | Evaluation路由Zod校验 | ✅ | `routes/evaluation.routes.ts`, `routes/route-dtos.ts` |
| 6 | 中 | req.query Zod校验 | ✅ | `routes/route-dtos.ts`, `routes/feedback.routes.ts`, `routes/jobs.routes.ts` |
| 7 | 中 | Content-Disposition控制字符清理 | ✅ | `routes/files.routes.ts` |
| 8 | 中 | V1 search参数长度限制 | ✅ | `repositories/jobs.repository.ts` |
| 9 | 中 | CORS methods添加PATCH | ✅ | `server.ts` |
| 10 | 低 | 前端时区UTC/local统一 | ✅ | `services/stats.service.ts` |
| 11 | 低 | getTrendStats N+1查询 | ✅ | `services/stats.service.ts`, `services/stats.service.test.ts` |
| 12 | 低 | getFieldStats无限制加载 | ✅ | `services/stats.service.ts` |
| 13 | 低 | 文件读取流式处理 | ✅ | `storage/storage.types.ts`, `storage/local-storage.provider.ts`, `storage/s3-storage.provider.ts`, `storage/index.ts` |
| 14 | 低 | Knowledge retriever缓存 | ✅ | `services/database-knowledge-retriever.ts` |
| 15 | 低 | Job queue并发限制 | ✅ | `services/api-services.ts`, `services/api-services.test.ts` |
| 16 | 低 | 列表分页 | ✅ | `repositories/evaluation.repository.ts`, `repositories/schema.repository.ts`, `repositories/webhook.repository.ts`, `services/api-services.ts`, `routes/schemas.routes.ts`, `bootstrap/production-services.ts`, 2个test文件 |
| 17 | 低 | Writeback竞态条件 | ✅ | `services/api-services.ts` |
| 18 | 低 | Provider default原子性 | ✅ | `repositories/provider.repository.ts`, `repositories/domainRepositories.test.ts` |

---

## 详细修复说明

### Fix #1: Prisma错误统一处理中间件
- **新建** `apps/api/src/middleware/prisma-error.middleware.ts`
- 提供 `isPrismaError()` 类型守卫和 `handlePrismaError()` 映射函数
- P2002（唯一约束）→ 409 CONFLICT，P2003（外键）→ 400，P2025（未找到）→ 404
- 在 `server.ts` 的 `setErrorHandler` 顶部集成，优先处理 Prisma 错误
- **新建** 测试文件，18 个测试用例覆盖全部错误码映射

### Fix #2: 文件上传后DB失败清理
- `api-services.ts` 的 `createUpload` 方法中，用 try/catch 包裹 `fileRepository.create()`
- DB 创建失败时调用 `storageProvider.delete(storedFile.key)` 清理已上传文件
- delete 失败不会掩盖原始 DB 错误

### Fix #3: Session invalidation默认模式
- `production-services.ts` 中当 `SESSION_INVALIDATION_STORE_MODE` 未设置且 `DATABASE_URL` 存在时，默认使用 `repository` 模式
- 内存模式启动时打印 `console.warn` 警告多实例部署风险

### Fix #4: Rate limiter Redis支持
- `server.ts` 新增 `RateLimitStore` 接口和 `RedisRateLimitClient` 接口
- 新增 `createMemoryRateLimitStore()` 和 `createRedisRateLimitStore(client)` 工厂函数
- `CreateApiServerOptions` 新增可选 `rateLimitStore` 参数
- 默认仍使用内存模式，可通过注入 Redis store 切换

### Fix #5: Evaluation路由Zod校验
- `route-dtos.ts` 新增 `createEvaluationRunRouteInputSchema` 和 `createEvaluationDatasetRouteInputSchema`
- `evaluation.routes.ts` 移除手动 `isCreateRunBody`/`isCreateDatasetBody`/`isRecord` 函数
- 改用 Zod `safeParse` + `parsed.data`

### Fix #6: req.query Zod校验
- `route-dtos.ts` 新增 `jobListQuerySchema`、`feedbackListQuerySchema`、`feedbackAllQuerySchema`
- `jobs.routes.ts` 和 `feedback.routes.ts` 应用 Zod schema 校验 query 参数
- 包含分页参数标准化（page/pageSize）和长度限制

### Fix #7: Content-Disposition控制字符清理
- `files.routes.ts` 中下载文件名先经 `replace(/[\x00-\x1f\x7f\\"]/g, "_")` 清理
- 防止 `\r`、`\n`、`\t` 等控制字符注入 HTTP header

### Fix #8: V1 search参数长度限制
- `jobs.repository.ts` 的 `listPaginated` 方法中，search 参数截断至 200 字符

### Fix #9: CORS methods添加PATCH
- `server.ts` CORS methods 从 `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` 改为包含 `"PATCH"`

### Fix #10: 前端时区UTC/local统一
- `stats.service.ts` 的 SQL 查询使用 `AT TIME ZONE 'UTC'` 确保日期分桶与前端 UTC 显示一致

### Fix #11: getTrendStats N+1查询优化
- 原方案：先 `findMany` 获取所有 jobId，再传入 `$queryRawUnsafe`
- 新方案：单条 SQL，`INNER JOIN RecognitionJob` 直接按 `schemaKey` 过滤
- 消除一次数据库往返，测试同步更新

### Fix #12: getFieldStats无限制加载
- `recognitionResult.findMany` 添加 `take: 1000` 上限
- 防止单次加载全部 RecognitionResult 导致内存溢出

### Fix #13: 文件读取流式处理
- `storage.types.ts` 新增 `StoredFileStream` 接口（含 `stream: Readable`）
- `StorageProvider` 新增可选 `getStream()` 方法
- `local-storage.provider.ts` 实现基于 `createReadStream` 的流式读取
- `s3-storage.provider.ts` 实现基于 S3 Body 的流式读取
- 方法设为 optional 避免破坏现有 mock

### Fix #14: Knowledge retriever缓存
- `database-knowledge-retriever.ts` 新增 5 分钟 TTL 缓存
- 闭包变量 `cachedEntries` + `cacheExpiresAt`，`getEntriesWithCache()` 惰性刷新
- 缓存命中时跳过数据库查询

### Fix #15: Job queue并发限制
- `createInProcessJobQueueExecutor` 读取 `MAX_CONCURRENT_JOBS` 环境变量（默认 3）
- 实现信号量模式：`runningJobs` 计数器 + `waitingQueue` FIFO 等待队列
- `describe()` 输出包含 `maxConcurrent` 策略信息

### Fix #16: 列表分页
- `evaluation.repository.ts`: `listDatasets` 和 `listRunsByDataset` 支持可选 `page`/`pageSize`
- `schema.repository.ts`: `listActive` 支持可选分页
- `webhook.repository.ts`: `list` 支持可选分页
- 全部返回 `{ items, total, page, pageSize }` 结构
- 相关调用方和测试同步更新

### Fix #17: Writeback竞态条件
- 幂等键从 `${jobId}:${timestamp}` 改为确定性 `writeback:${jobId}`
- 利用 Prisma `@@unique([idempotencyKey])` 约束实现原子去重
- P2002 错误映射为 `WRITEBACK_ALREADY_RUNNING_OR_COMPLETED` (409)

### Fix #18: Provider default原子性
- `provider.repository.ts` 依赖类型扩展为包含 `$transaction`
- `save`（isDefault=true 时）和 `setDefault` 方法内 `clearDefault + upsert/update` 包裹在 `$transaction` 中
- 测试 mock 同步更新

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `pnpm typecheck` | ✅ 通过（0 错误） |
| `cd medical-ui && pnpm build` | ✅ 通过 |
| 前端测试 | ✅ 15/15 通过 |
| 后端测试 | ✅ 354 通过，11 失败（全部为预存问题） |
| 新增失败 | 0 |

### 预存失败（非本次修改引入）
- `production-services.test.ts`: 8 个测试失败（基线即存在）
- `docs/hard-remove-mock-provider-user-surface.test.ts`: ENOENT `apps/demo-web/` 缺失
- `docs/p2-production-handoff.test.ts`: ENOENT `apps/demo-web/` 缺失

---

## 变更统计

- **修改文件**: 24 个
- **新建文件**: 2 个（`prisma-error.middleware.ts` + 测试）
- **新增代码**: +502 行
- **删除代码**: -216 行
- **净变更**: +286 行
