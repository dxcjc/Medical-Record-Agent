# Medical P2 Next Closure Audit Report

生成时间：2026-06-09 09:54 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品覆盖文件上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 smoke。

本轮审计聚焦 P2 安全会话边界，不把 UI 阶段通过、本地 mock smoke 或浏览器 E2E 误判为医疗最终产品完成。

## 2. 功能完整性

本轮已补齐：

- API 登录下发 `mra_session` HttpOnly cookie。
- API 登出清除 session cookie，并使当前 session token 失效。
- 登录时带旧 session cookie 会失效旧 token，实现最小会话轮换边界。
- 受保护路由支持 HttpOnly cookie JWT，同时保留 Bearer JWT 和 API token。
- 前端 API client 对请求使用 `credentials: "include"`。
- 生产前端默认不把 JWT 持久化到 `localStorage`，只持久化用户、角色、权限元数据。
- 安全响应头和登录/写回 rate limit 回归继续通过。

未补齐：

- 多实例生产 session store 或集中 token revocation store。
- 真实外部 OCR/LLM/LIMS sandbox。
- 真实 KMS/Vault/Secret Manager。
- 真实 broker 多实例可靠队列 smoke。

## 3. 业务流程完整性

本轮会话流程：

- 用户登录 `/auth/login`。
- API 返回原 Bearer token payload 兼容脚本调用，同时下发 HttpOnly `mra_session` cookie。
- 浏览器后续请求可只凭 cookie 访问受保护路由。
- 用户登出 `/auth/logout` 后，API 清除 cookie，并使该 token 在当前进程内失效。
- 同一 cookie 再访问受保护路由返回 `401`。

兼容流程：

- CLI、production smoke、系统调用方仍可使用 Bearer JWT 或 `x-api-token`。
- 开发环境或显式 legacy 配置可继续持久化 token，避免打断现有本地 E2E 注入方式。

真实生产流程仍 blocked：多实例部署需要把 session invalidation 从进程内集合迁移到数据库、Redis 或等价集中 store；本轮不声明该项已完成。

## 4. 用户体验

UI 当前阶段保持 Material + Arco Design：

- 本轮未改 `styles.css`，未粗暴重写 CSS。
- 现有 Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、字体和移动端 guard 均由测试继续覆盖。
- 用户登出后本地状态立即清理，同时请求后端失效 session；后端失败不会把用户卡在已登录页面。

用户侧收益主要在安全边界：生产浏览器不再长期持久化 JWT 明文到 localStorage，降低 XSS 后 token 被直接读取的风险。

## 5. 技术实现

关键文件：

- `apps/api/src/auth/session-cookie.ts`
  - cookie 解析、下发和清除 helper。

- `apps/api/src/auth/auth.service.ts`
  - session invalidation contract 和进程内最小实现。

- `apps/api/src/routes/auth.routes.ts`
  - login cookie、旧 session 轮换、logout 清 cookie。

- `apps/api/src/middleware/auth.middleware.ts`
  - Bearer JWT、cookie JWT、API token 统一鉴权入口。

- `apps/api/src/server.ts`
  - CORS `credentials: true`，配合本地 demo-web cookie session。

- `apps/demo-web/src/api/client.ts`
  - `credentials: "include"` 和 `logout()`。

- `apps/demo-web/src/auth/AuthContext.tsx`
  - `shouldPersistAccessToken()` 与 `createStoredAuthFromLoginResponse()`。

测试证明：

- route 级测试证明 cookie 属性、登出清除和登录轮换。
- server 级测试证明 cookie 鉴权和登出失效作用到受保护路由。
- 前端 client/AuthContext 测试证明 cookie credentials 和生产 token 存储边界。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 typecheck、全量测试、demo-web build、demo-web smoke 或本地 readiness 的 P0。

P1 已闭环：

- 生产前端默认不再持久化 JWT 到 `localStorage`。
- 浏览器会话支持 HttpOnly cookie。
- 登出不再只是前端清状态，后端会清 cookie 并失效当前 session token。
- 旧 session 登录时会被轮换失效。

P1 remaining/blocked：

- 多实例生产 session invalidation store 尚未接入。
- 真实 OCR/LLM/LIMS sandbox smoke 仍 blocked。
- 真实 KMS/Vault/Secret Manager 仍 blocked。

P2 已闭环：

- API client cookie credentials contract。
- Cookie JWT 与 Bearer/API token 兼容鉴权 contract。
- CSP、安全头、rate limit 回归继续通过。

P2 remaining/blocked：

- 真实 Redis/RabbitMQ/SQS broker、多 worker lease/retry/dead-letter/heartbeat/status consistency smoke。
- 前端异步任务更细粒度的取消/队列积压可视化仍可继续优化。
- 真实生产 smoke `STATUS passed` 尚未达成。

## 7. 验收结论

验证命令：

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：通过，67 passed、1 skipped；358 passed、1 skipped。仍有既有 Node `DEP0040 punycode` deprecation warning。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，15 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 bundle `index-BkZEagFb.js`。
- `corepack pnpm smoke:demo-web`：通过，`mode=mock-runtime`、`apiHealthOk=true`、`distBundleOk=true`。
- `corepack pnpm readiness:deployment`：exit code 2，`localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`。
- 9901 首页：200 OK。
- 9901 `/api/health`：200 OK。
- dist 与 9901 HTML 均引用 `/assets/index-BkZEagFb.js`。

分层结论：

- UI 当前阶段：通过。
- P1/P2 本轮会话安全阶段：通过。
- 真实外部集成：blocked。
- 医疗最终产品：不通过/blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、真实 broker 多实例 smoke 未通过前，不能改写为通过。
