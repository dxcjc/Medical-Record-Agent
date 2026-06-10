# Medical P1/P2 Next Contract Security Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖上传、OCR/LLM 编排、Schema 管理、Provider 运维、字段证据、人工反馈、Evaluation、LIMS 写回、安全审计和生产 readiness。

本轮不是 UI 完成验收，也不是医疗最终产品完成验收。本轮聚焦前序报告中仍可在本地闭环的 P1/P2 契约安全项：schemas/providers/audit route-facing response contract 从运行时 guard 推进到编译期类型约束。

## 2. 功能完整性

本轮已完成：

- Schema route service：`listActive/createDraft/updateDraft/validateDraft/publishDraft/deactivateVersion/rollbackVersion/compareVersions` 返回类型收紧为 `ApiRouteResponseObject` 或对象数组。
- Provider route service：`listProviders/saveProviderConfig/setDefaultProvider/checkProviderHealth` 返回类型收紧为 route response object/list。
- Audit route service：`listRecent` 返回类型收紧为 route response object list。
- ProviderRegistry：生产/组合 service 的 provider response contract 同步收紧，避免 route-facing provider registry 回到 `unknown`。
- 编译期 contract 测试：新增 `route-service-contracts.test.ts`，用 `@ts-expect-error` 守住 scalar service fixture 不能满足 route service 接口。
- 运行时 guard：schemas/providers/audit 原有 scalar response 500 guard 仍保留，并用 unsafe cast 显式模拟绕过编译期的异常 service。

未完成且不能伪造：

- 未接真实 OCR/LLM/LIMS sandbox。
- 未接真实 KMS/Vault/Secret Manager。
- 未完成生产多实例 session invalidation store。
- 未完成真实 broker/queue 多实例 smoke。
- 未通过真实外部 production smoke。

## 3. 业务流程完整性

当前本地契约链路继续保持：

登录 -> Schema/Provider/Audit 运维 API -> request DTO 校验 -> service route response object contract -> response guard/redaction -> 前端读取稳定对象响应。

本轮增强点：

- 编译期不再允许 schema/provider/audit route service 以 scalar 或 scalar list 作为合法实现。
- 运行时仍可防御异常注入或外部 mock service 返回 scalar，避免被包装成 200 成功响应。
- Provider 与 Audit 前序 redaction 仍然有效，本轮没有放松 secretRefs、Authorization、token、password、apiKey 等脱敏边界。

真实业务闭环仍 blocked：没有真实 OCR/LLM/LIMS sandbox 和真实生产依赖时，不能确认医疗识别和写回的最终生产闭环。

## 4. 用户体验

本轮未修改 demo-web CSS 或医疗样式，Material + Arco Design 当前阶段继续保持：

- `test:styles` 通过，19 tests passed。
- `test:mobile` 通过，5 passed / 14 skipped。
- demo-web build 通过，无 500 kB JS chunk warning。
- 9901 首页和 `/api/health` 可访问。

用户侧收益主要体现在稳定性和安全可诊断性：Schema/Provider/Audit 页面背后的服务实现如果返回非对象响应，会在编译期或运行时被拦截，减少“错误数据被前端当成功对象展示”的风险。

## 5. 技术实现

关键文件：

- `apps/api/src/routes/route-service-contracts.test.ts`
  - 编译期契约守卫，验证 scalar schema/provider/audit service fixture 必须被 TypeScript 拒绝。

- `apps/api/src/routes/schemas.routes.ts`
  - `SchemaRouteService` 从 `unknown` 返回收紧为 route response object/list。

- `apps/api/src/routes/providers.routes.ts`
  - `ProviderRouteService` 从 `unknown` 返回收紧为 route response object/list。

- `apps/api/src/routes/audit.routes.ts`
  - `AuditRouteService.listRecent()` 从 `unknown[]` 收紧为 `ApiRouteResponseObject[]`。

- `apps/api/src/services/api-services.ts`
  - `ProviderRegistry` route-facing 返回同步收紧。

- `apps/api/src/services/schema.service.ts`
  - Schema snapshot/repository route-facing 返回同步收紧；`validateDraft()` 返回结构化 route object。

- `apps/api/src/routes/schemas.routes.test.ts`
- `apps/api/src/routes/providers.routes.test.ts`
- `apps/api/src/routes/audit.routes.test.ts`
  - bad service response 测试改为显式 unsafe cast，保留运行时 500 guard。

- `docs/superpowers/plans/2026-06-09-p1-p2-next-contract-security.md`
  - 记录本轮 superpowers 流程。

TDD 证据：

- 红灯：`corepack pnpm --filter @medical-record-agent/api typecheck` 初次失败，3 个 `Unused '@ts-expect-error' directive`。
- 绿灯：类型收紧后 API typecheck、根 typecheck、定向测试和全量测试均通过。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前阻断 demo-web build、typecheck、全量测试、9901 基础访问的 P0。

P1 已推进：

- schemas/providers/audit route-facing response contract 从 `unknown` 收敛为 `ApiRouteResponseObject` / `ApiRouteResponseObject[]`。
- 编译期阻止 scalar service 实现进入 route service 装配。
- 运行时 response guard 保持，异常 scalar 响应仍返回 500，不包装为业务成功。

P1 still blocked：

- 真实 OCR/LLM/LIMS sandbox 未配置且未通过真实 smoke。
- 真实 LIMS 写回 sandbox 未验收。
- 真实 KMS/Vault/Secret Manager 未接入 provider secret resolver。

P2 已推进：

- 新增编译期 contract guard，防止后续把 schemas/providers/audit route service 返回类型退回 `unknown`。
- demo-web style/mobile/build 和 9901 基础访问继续通过。
- dist 最终构建产物为新文件，`index.html` 引用 `/assets/index-RRIirKAv.js`。

P2 still blocked：

- 生产多实例 session invalidation store 未接真实数据库/Redis 并通过多实例 smoke。
- 真实 Redis/RabbitMQ/SQS broker 队列、多 worker lease/retry/dead-letter/heartbeat/status consistency smoke 未通过。
- 全量测试仍有既有 Node `DEP0040 punycode` warning；数据库 repository integration 当前环境按设计 skipped。

## 7. 验收结论

必跑验证：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed / 14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，最终入口 `index-RRIirKAv.js`；无 500 kB JS chunk warning。 |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm test` | 通过，70 passed / 1 skipped files；407 passed / 1 skipped tests；有既有 `DEP0040 punycode` warning。 |

定向验证：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/api typecheck` | 先红后绿；最终通过。 |
| `corepack pnpm vitest run apps/api/src/routes/route-service-contracts.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts` | 通过，4 files passed，28 tests passed。 |

9901 与 dist：

- `curl -I --max-time 5 http://localhost:9901/`：200 OK。
- `curl --max-time 5 http://localhost:9901/api/health`：200 OK，`{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 引用 `/assets/index-RRIirKAv.js` 和 `/assets/vendor-arco-_4u-J6Qa.js`。
- `apps/demo-web/dist/index.html`、`apps/demo-web/dist/assets/index-RRIirKAv.js`、`apps/demo-web/dist/assets/vendor-arco-_4u-J6Qa.js` 均存在，时间戳 2026-06-09 18:16。

分层结论：

- UI 当前阶段：通过。本轮未改 UI 样式，Material + Arco Design 守卫继续通过。
- P1/P2 本轮阶段：通过。schemas/providers/audit route response 类型契约和运行时 guard 闭环。
- 真实外部集成：blocked。真实 OCR/LLM/LIMS、真实 KMS/Vault/Secret Manager、真实 session store、真实 broker/queue、多实例 production smoke 未完成。
- 医疗最终产品：blocked。不能把本地 contract/security 闭环或 UI 当前阶段通过写成医疗最终产品完成。

本轮未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录。
