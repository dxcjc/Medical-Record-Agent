# Medical P2 Next Closure Fix Report

生成时间：2026-06-09 09:54 CST / Asia/Shanghai

## 本轮目标

本轮继续推进不依赖真实外部凭据的 P1/P2 安全闭环，聚焦浏览器会话安全边界：HttpOnly cookie session、登出失效、会话轮换、生产前端 token 存储边界和安全头/CORS cookie 回归。

本轮没有声明真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager 或真实 broker 已通过。

## Superpowers 流程

- Brainstorming：综合产品审计、P1/P2 修复报告、deployment readiness、production handoff 和 closure 报告后，确认 UI/local readiness 已阶段通过，真实外部集成仍 blocked；当前最可闭环的遗留是 JWT/localStorage 与 logout 仅前端清理的安全边界。
- Writing plan：已写入 `docs/superpowers/plans/2026-06-09-p2-next-closure.md`，明确 TDD、实现范围和最终 blocked 边界。
- TDD/测试优先：先新增 API route/server、demo-web API client、AuthContext 存储边界测试并观察红灯，再实现。
- Verification before completion：按用户指定命令完成验证，`readiness:deployment` 本地通过但真实外部 blocked。

## 修复文件

- `apps/api/src/auth/session-cookie.ts`
  - 新增 `mra_session` cookie 读写 helper。
  - 登录 cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/`；登出 cookie 使用 `Max-Age=0` 清除。

- `apps/api/src/auth/auth.service.ts`
  - 新增进程内 session token invalidation contract。
  - `authenticateJwt()` 会拒绝已失效 session token。
  - 该实现是本地最小边界，不代表多实例生产 session store。

- `apps/api/src/routes/auth.routes.ts`
  - `/auth/login` 设置 HttpOnly session cookie。
  - 登录时如已有旧 `mra_session`，会先失效旧 token，实现会话轮换边界。
  - 新增 `/auth/logout`，清除 cookie 并失效当前 session token。

- `apps/api/src/middleware/auth.middleware.ts`
  - 受保护路由支持 Bearer JWT、HttpOnly cookie JWT、API token 三种入口。
  - 已失效 cookie session 被拒绝为 `401 UNAUTHORIZED`。

- `apps/api/src/server.ts`
  - CORS 启用 `credentials: true`，允许本地 demo-web 携带 HttpOnly cookie。

- `apps/api/src/demo-services.ts`
  - demo auth service 补齐 session invalidation contract，保持 demo/local 服务可装配。

- `apps/demo-web/src/api/client.ts`
  - 所有请求使用 `credentials: "include"`，支持 HttpOnly cookie session。
  - 新增 `api.logout()` 调用 `/auth/logout`。
  - Bearer token 仍兼容，用于开发、本地脚本和 API token 流程。

- `apps/demo-web/src/auth/AuthContext.tsx`
  - 生产默认不再把 JWT 写入 `localStorage`。
  - 生产只持久化用户、权限和角色元数据；认证请求依赖 HttpOnly cookie。
  - 开发环境或显式 `VITE_AUTH_TOKEN_STORAGE=localStorage` 仍可保留 legacy token 存储，便于本地和既有 E2E。

## 新增/更新测试

- `apps/api/src/routes/auth.routes.test.ts`
  - 验证 login 设置 `mra_session`、`HttpOnly`、`SameSite=Lax`、`Path=/`。
  - 验证 logout 清除 cookie 并调用 session invalidation。
  - 验证带旧 session cookie 登录会轮换会话并失效旧 token。

- `apps/api/src/server.test.ts`
  - 验证受保护路由可通过 HttpOnly cookie 访问。
  - 验证 logout 后同一 cookie 访问受保护路由返回 `401`。

- `apps/demo-web/src/api/client.test.ts`
  - 验证请求携带 `credentials: "include"`。
  - 验证无 Bearer token 时仍支持 cookie credentials。
  - 验证 `logout()` 调用 `/auth/logout`。

- `apps/demo-web/src/auth/AuthContext.test.ts`
  - 验证生产默认不持久化 JWT。
  - 验证开发或显式 legacy 模式才允许持久化 token。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，Test Files `67 passed | 1 skipped (68)`；Tests `358 passed | 1 skipped (359)`。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过；新入口 bundle `index-BkZEagFb.js`，最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB，无 500 kB JS warning。
- `corepack pnpm smoke:demo-web`：通过，`ok=true`、`mode=mock-runtime`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm readiness:deployment`：exit code 2；`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。

## 9901 检查

- `curl -i --max-time 10 http://localhost:9901/`：200 OK。
- `curl -i --max-time 10 http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 和 9901 首页 HTML 均引用：
  - `/assets/index-BkZEagFb.js`
  - `/assets/vendor-react-CosDLm1s.js`
  - `/assets/vendor-core-Cy0vAc9s.js`
  - `/assets/vendor-arco-_4u-J6Qa.js`
  - `/assets/vendor-app-runtime-CHfy19Dx.js`
  - `/assets/vendor-interaction-RSoQEDTg.js`

## 剩余 Blocked 条件

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox URL、账号、provider key、LIMS 写回环境和脱敏样本 smoke。
- 真实 KMS/Vault/Secret Manager：blocked，当前不能声明真实密钥库读取通过。
- 真实 broker 多实例可靠队列：blocked，缺真实 Redis/RabbitMQ/SQS、多 worker lease/retry/dead-letter/heartbeat/status consistency smoke。
- session 生产多实例：本轮只提供进程内最小 session invalidation；生产多实例需接数据库/Redis session store 或等价集中失效机制。

## 结论

- UI 当前阶段：通过，本轮未改 CSS。
- P1/P2 本轮会话安全阶段：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。
