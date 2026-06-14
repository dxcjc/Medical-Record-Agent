# 遗留问题修复 — 中低优先级（18项）

项目路径: /tmp/Medical-Record-Agent

## 中优先级（10项）

### 1. Prisma错误无统一处理中间件
- 创建 `apps/api/src/middleware/prisma-error.middleware.ts`
- 统一处理 P2002（唯一约束）、P2003（外键）、P2025（未找到）
- 在 server.ts 注册为全局 hook

### 2. 文件上传后DB失败无清理
- `api-services.ts` 中文件上传成功但 DB 创建失败时，删除已上传文件
- 使用 try/catch 包裹 DB 操作，catch 中调用 storageProvider.delete

### 3. Session invalidation默认内存模式
- `auth.service.ts` 中 `SESSION_INVALIDATION_STORE_MODE` 默认为 memory
- 改为：有 DATABASE_URL 时默认 repository 模式
- 或至少在启动时打印警告

### 4. Rate limiter内存Map不支持多实例
- 当前用内存 Map，多实例部署会失效
- 添加 Redis-backed 方案（可选，默认保持内存）
- 或添加环境变量 `RATE_LIMIT_STORE=redis`

### 5. Evaluation路由用手动type guard替代Zod
- `evaluation.routes.ts` 中手动检查字段
- 替换为 Zod schema 校验

### 6. req.query大部分路由未用Zod校验
- 至少为 `/jobs`, `/audit`, `/feedback`, `/writeback` 添加 query schema
- 使用 `route-dtos.ts` 中已有的 schema

### 7. Content-Disposition未完全清理控制字符
- `files.routes.ts` 中使用 `encodeURIComponent`
- 额外清理 `\r`, `\n`, `\t` 等控制字符

### 8. V1 search参数无长度限制
- `jobs.repository.ts` 中 search 参数无 maxLength
- 添加 200 字符限制

### 9. CORS methods缺少DELETE
- `server.ts` 中 CORS methods 可能缺少 DELETE
- 确保包含 GET, POST, PUT, DELETE, PATCH, OPTIONS

### 10. 前端时区UTC/local不一致
- `stats.service.ts` 和 `DashboardPage.tsx` 中日期格式化
- 统一使用 UTC 或 local（建议 local）

## 低优先级（8项）

### 11. getTrendStats N+1查询
- `stats.service.ts` 中先查所有 ID 再传入 SQL
- 合并为单个 SQL 查询

### 12. getFieldStats无限制加载
- `stats.service.ts` 中无限制加载所有 RecognitionResult
- 添加 schemaKey 过滤或分页

### 13. 文件读取无流式处理
- `local-storage.provider.ts` 中读取整个文件到内存
- 对大文件使用流式读取（createReadStream）

### 14. Knowledge retriever每次加载全部
- `database-knowledge-retriever.ts` 每次 RAG 查询加载全部知识条目
- 添加缓存（5分钟TTL）或按 schemaKey 过滤

### 15. Job queue无并发限制
- `api-services.ts` 中任务队列无并发限制
- 添加环境变量 `MAX_CONCURRENT_JOBS`（默认3）

### 16. Schema/Evaluation/Webhook列表无分页
- 多个 repository 的 list 方法无分页
- 添加 page/pageSize 参数

### 17. Writeback竞态条件
- `api-services.ts` 中 check-then-act 非原子
- 使用数据库事务或乐观锁

### 18. Provider default设置非原子
- `provider.repository.ts` 中 clear + upsert 非原子
- 使用数据库事务

## 验证标准
- `pnpm typecheck` 通过
- `cd medical-ui && pnpm build` 通过
- 后端测试全部通过
- 生成 MEDIUM-LOW-FIXES-AUDIT.md
