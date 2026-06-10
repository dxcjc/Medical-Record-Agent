# 2026-06-09 P2 Next Local Session Store Closure

## Brainstorming

- 已读取本轮指定 6 份 continuation/audit/fix/handoff 材料。
- 当前可确信：UI 当前阶段、本地 typecheck/test/demo-web styles/mobile/build、9901 基础访问和 mock-runtime/readiness local gates 已处在可守住状态。
- 不能改写为医疗最终产品完成：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列仍 blocked。
- 最高价值本地闭环方向：继续推进生产多实例 session invalidation store。上一轮已有 repository contract 和 `/status` blocked posture，本轮补齐更具体的 database/redis adapter skeleton、readiness 诊断和本地可执行验收脚本，不依赖真实外部凭据，也不声称真实多实例通过。

## Writing Plan

1. TDD: 先补 session invalidation repository adapter 测试，要求：
   - database adapter skeleton 只写入 token hash、`invalidatedAt`、`expiresAt`，查询时只返回未过期 hash。
   - redis adapter skeleton 使用 TTL 写 hash，不写 raw JWT/cookie，并能按 hash 查询。
   - adapter diagnostics 暴露 provider、storage、TTL、redaction 和 blocked smoke posture。
2. TDD: 先补 production services 测试，要求 factory 可从配置和注入 client/prisma-like delegate 创建 database/redis repository，但仍 `SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN`。
3. TDD: 先补本地验收脚本测试，要求输出 `localReadiness=passed`、`externalIntegration=blocked`、`finalProduct=blocked`，并包含 `two-instance-session-invalidation-smoke`、`token-hash-ttl-verification`、`raw-token-not-persisted-check`。
4. 实现：
   - 新增 `apps/api/src/auth/session-invalidation.repository.ts`，提供 database/redis adapter skeleton 和 diagnostics。
   - 更新 `apps/api/src/bootstrap/production-services.ts`，接入 adapter factory 和更细 readiness config，不接真实 SDK、不迁移数据库、不声称 productionReady。
   - 新增 `scripts/session-invalidation-readiness.ts`，作为部署方接真实 store 前的本地验收/诊断脚本。
   - 更新 `package.json` 增加脚本入口。
   - 更新 handoff 文档和最终报告。
5. Verification before completion：
   - 运行指定 typecheck/test/styles/mobile/build/readiness 命令。
   - curl 检查 9901 `/` 与 `/api/health`。
   - 确认 `apps/demo-web/dist/index.html` 与 9901 首页引用当前 bundle。

## Acceptance Boundary

- UI 当前阶段：只能按本地 guard/build/9901 判定通过或不通过。
- 本轮 P1/P2 本地产品化闭环：只对 session invalidation adapter skeleton、诊断和本地验收脚本判定通过或不通过。
- 真实外部集成：真实 OCR/LLM/LIMS、真实密钥库、真实共享 session store、真实 broker smoke 未跑通前继续 blocked。
- 医疗最终产品：上述真实外部条件全部通过前必须写不通过/blocked。
