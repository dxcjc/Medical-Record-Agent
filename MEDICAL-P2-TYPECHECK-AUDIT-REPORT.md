# Medical P2 Typecheck Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向医疗病历识别、结构化抽取、Schema 治理、人工反馈、Evaluation、LIMS 写回、Provider 运维和审计追踪的工作台。

本轮审计针对 P0 typecheck 阻断重新验证。结论口径更新为：本地 readiness 已恢复通过，mock-production contract 可用；医疗项目不是最终完成，真实 OCR/LLM/LIMS sandbox、KMS/Vault、broker 多实例、production smoke 仍 blocked。

## 2. 功能完整性

已恢复：

- API 会话失效能力恢复为可导出真实实现：in-memory store、本地 hash、repository-backed store。
- production session invalidation store contract 恢复：缺配置、缺 adapter、已注入 repository 但未跑真实多实例 smoke 三种状态均可区分。
- `/status` 可返回脱敏 session invalidation store posture，供 production smoke/readiness gate 判定 blocked。
- HttpOnly `mra_session` cookie、logout session 失效、旧 session 轮换、Bearer/API token 兼容路径保持可测。
- demo-web build、local smoke、browser E2E 在 readiness gate 中继续通过。

未完整：

- 真实 OCR/LLM/LIMS sandbox 未执行。
- 真实 KMS/Vault/Secret Manager 未接入。
- 真实 Redis/RabbitMQ/SQS broker 多实例可靠队列未验证。
- 生产多实例 session invalidation store 仍未通过真实 smoke。

## 3. 业务流程完整性

本地业务流程：

- 登录、cookie session、Bearer token fallback、API token 认证、logout 清理、旧 session 轮换已被单元和路由测试覆盖。
- 识别任务、Provider 设置、写回、Evaluation、审计和 Schema 页面仍可通过 demo-web local smoke 与 browser E2E 打开。
- mock-production contract smoke 可跑通 status、login、provider health、file upload、recognition job、result read、writeback。

生产业务流程：

- real production smoke 当前 blocked，缺真实 sandbox base URL、账号和密码。
- 没有真实 OCR/LLM/LIMS sandbox 时，不能证明从真实病历输入到真实 LIMS 写回的端到端生产闭环。
- 没有真实 KMS/Vault 和 broker 多实例 smoke 时，不能证明生产密钥治理和多实例任务一致性。

## 4. 用户体验

当前 UI 阶段值得肯定：

- demo-web 关键页面通过本地 smoke 和 Chrome CDP browser E2E。
- 桌面与移动截图已重新生成到 `ui-parity-screenshots/medical-e2e-current/`。
- Arco 风格守卫、mobile guards、dist bundle 检查均通过。
- 登录、首页、识别新建、任务详情、Provider、写回等关键入口可访问。

仍可优化：

- 当前 UI 已适合作为产品级演示和内部评审，但还不是最终生产交付。
- 真实外部 provider 接入后，需要继续检查错误态、加载态、长文本、低置信字段、写回失败和审计详情的真实数据表现。
- 后续应补真实 sandbox 下的端到端可用性与文案细节检查。

## 5. 技术实现

本轮关键技术状态：

- `apps/api/src/auth/auth.service.ts`
  - 提供 `hashSessionToken`、`createInMemorySessionInvalidationStore`、`createRepositorySessionInvalidationStore`。
  - repository-backed store 只持久化 token hash，支持 TTL。
  - JWT 认证前检查 session 是否已失效。

- `apps/api/src/bootstrap/production-services.ts`
  - 提供 `buildProductionSessionInvalidationStoreContract()` 与 `createProductionSessionInvalidationStore()`。
  - repository 配置完整但未接 adapter 时保持 blocked。
  - repository 已注入时仍要求真实多实例 smoke，避免把 mock repository 误判为生产完成。

- `apps/api/src/server.ts`
  - `/status` 输出脱敏 runtime contract，不暴露 `mra_session` 或 raw JWT。

- `apps/demo-web/src/auth/AuthContext.tsx`
  - 生产默认 cookie session，不默认持久化 JWT。
  - `VITE_AUTH_TOKEN_STORAGE=localStorage` 仅作为开发/legacy token 模式。

## 6. P0/P1/P2 问题清单

P0：

- 已修复：`corepack pnpm typecheck` 在 session invalidation store/production contract 处失败。
- 当前未发现新的本地 P0 阻断。

P1：

- blocked：真实 OCR/LLM/LIMS sandbox 未通过。
- blocked：真实 KMS/Vault/Secret Manager 未通过。
- blocked：真实 broker 多实例队列未通过。
- blocked：production 多实例 session invalidation store 未通过。

P2：

- 已恢复：session invalidation store contract、production factory、`/status` 脱敏 posture。
- 已保持：生产前端默认不持久化 JWT。
- 待优化：真实外部接入后的 UI 状态、错误文案、性能和可观测性细节。

## 7. 验收结论

本地验收：通过。

- `corepack pnpm typecheck`：passed。
- `corepack pnpm test`：passed，67 files passed、1 skipped；364 tests passed、1 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：passed。
- `corepack pnpm smoke:demo-web`：passed。

部署 readiness：不通过，状态为 blocked。

- `corepack pnpm readiness:deployment`：exit code 2。
- `localReadiness=passed`。
- `externalIntegration=blocked`。
- `finalProduct=blocked`。

最终产品验收：不通过。

改进建议：

- 配置并验证真实 OCR/LLM/LIMS sandbox production smoke。
- 接入真实 KMS/Vault/Secret Manager resolver，并完成 secret resolution smoke。
- 接入真实 Redis/RabbitMQ/SQS broker，验证 lease/retry/dead-letter/heartbeat/status consistency 多实例 smoke。
- 将 production session invalidation store 接入数据库或 Redis，并完成多实例 logout/rotation smoke。
- 在真实数据链路跑 UI 细节复核，继续优化错误态、长文本和写回失败体验。
