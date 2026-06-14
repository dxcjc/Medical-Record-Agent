# 遗留问题修复 — 高优先级（5项）

项目路径: /tmp/Medical-Record-Agent

## 任务清单

### 1. API客户端网络错误处理
- `medical-ui/src/api/client.ts` 中所有 fetch 调用需要 try/catch
- 网络断开时显示友好错误（非白屏）
- 添加重试逻辑（可选，至少不崩溃）

### 2. Auth store token验证不完整
- 检查 `medical-ui/src/` 中 auth 相关 store
- token 过期时自动跳转登录页（非401循环）
- 添加 token 刷新机制或至少优雅降级

### 3. types.ts Record<string,unknown> 收敛
- `medical-ui/src/api/types.ts` 中大量 `Record<string, unknown>`
- 逐步替换为具体类型（至少对主要API响应）
- 保留部分 `Record<string, unknown>` 用于真正未知结构

### 4. 无Swagger/OpenAPI文档
- 添加 `swagger-jsdoc` 和 `swagger-ui-express`
- 在 `apps/api/src/server.ts` 注册 swagger 路由
- 为关键路由添加 JSDoc 注释（至少 /jobs, /results, /feedback, /writeback）
- 访问地址 `/docs`

### 5. LLM provider无重试逻辑
- `packages/core/src/providers/httpLlmProvider.ts` 添加重试
- 参考 `httpOcrProvider.ts` 的重试实现
- 最多重试3次，指数退避

## 验证标准
- `pnpm typecheck` 通过
- `cd medical-ui && pnpm build` 通过
- 后端测试全部通过
- 生成 HIGH-PRIORITY-FIXES-AUDIT.md
