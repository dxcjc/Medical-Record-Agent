# Pitfalls — Medical Record Agent

## Vitest 测试相关

### 1. Prisma Mock 初始化顺序
**问题**: 在 Vitest 中使用 Prisma mock 时，如果 `beforeAll` 中初始化 mock 对象但测试用例在模块加载时就引用了 Prisma client，会导致 `Cannot read properties of undefined`。
**解决**: 使用 `vi.mock('@prisma/client')` 在模块级别拦截，然后在 `beforeEach` 中重置 mock。

### 2. Fastify 服务测试端口冲突
**问题**: 并行运行多个 Fastify 服务测试时，固定端口会导致 `EADDRINUSE`。
**解决**: 使用 `fastify.listen({ port: 0 })` 让 OS 分配随机端口，从返回地址中提取实际端口。

### 3. 异步测试超时
**问题**: 涉及数据库操作的测试默认 5s 超时，复杂识别流程测试可能超时。
**解决**: 对长时间运行的测试设置 `test.timeout(30000)` 或在 `vitest.config.ts` 中全局设置 `testTimeout`。

### 4. ESM 模块 mock
**问题**: 项目使用 ESM (`"type": "module"`)，`vi.mock()` 的自动 hoisting 在 ESM 下需要显式导入被 mock 的模块。
**解决**: 确保 `vi.mock()` 在文件顶层调用，并使用 `vi.importActual()` 获取原始模块。

## 趋势图 API 使用注意事项

### 5. schemaKey 参数必需
**问题**: `/api/stats/trend` 和 `/api/stats/fields` 必需 `schemaKey` 查询参数，省略会返回 400。
**解决**: CLI 命令默认使用 `tumor-gene-test`，但应提示用户确认 schema key。

### 6. 趋势数据日期范围
**问题**: `days` 参数范围 1-365，超出会返回 400。默认 30 天。
**解决**: CLI 中对 `--days` 做范围校验，超出时给友好提示。

### 7. 统计 API 无认证
**问题**: `stats.routes.ts` 中未挂载 auth hook，统计 API 不需要认证。但这意味着任何可访问 API 的客户端都能查询统计。
**解决**: 如需限制访问，在 `server.ts` 中为 stats 路由添加认证中间件。

## CLI 相关

### 8. delete 命令的软删除
**问题**: `DELETE /jobs/:id` 是软删除，不会物理移除数据。用户可能误以为数据已完全清除。
**解决**: CLI 输出中明确提示 "已软删除"，并说明数据仍可通过数据库恢复。

### 9. push 命令的外部 endpoint 可达性
**问题**: `mra push` 将结果 POST 到外部 URL，如果外部服务不可达会直接报错。没有重试机制。
**解决**: 对于生产环境，建议在外部系统配置接收端点时添加健康检查。

### 10. export 命令的并发请求
**问题**: `mra export` 同时发起 `GET /jobs/:id` 和 `GET /results/:jobId` 两个请求（`Promise.all`）。如果其中一个失败，另一个的结果会被丢弃。
**解决**: 当前实现直接抛出错误，用户需重试。后续可考虑部分成功的容错逻辑。
