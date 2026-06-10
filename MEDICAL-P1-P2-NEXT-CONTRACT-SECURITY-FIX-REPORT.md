# Medical P1/P2 Next Contract Security Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 本轮范围

本轮按 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion` 执行。已先读取用户指定续接和审计报告，避开前序已完成的 UI/chunk、writeback payload 丢弃、demo fallback、evaluation schema selection、schemas/providers/audit request DTO、provider/audit redaction、production smoke blocked 诊断工作。

本轮选择当前环境可落地且不依赖外部凭据的 P1/P2：收紧 schemas/providers/audit route service response 类型边界，避免这些高价值运维 API 的 service 实现继续用 `unknown` 返回类型在编译期接受 scalar 或 scalar list。

## TDD 过程

红灯：

- 新增 `apps/api/src/routes/route-service-contracts.test.ts`。
- 先写 `@ts-expect-error` 编译期契约守卫，验证 scalar schema/provider/audit service fixture 不应满足 route service 接口。
- 初次运行 `corepack pnpm --filter @medical-record-agent/api typecheck` 失败：
  - `Unused '@ts-expect-error' directive` 出现在 3 处。
  - 说明当前 `SchemaRouteService`、`ProviderRouteService`、`AuditRouteService` 的 `unknown` 返回类型确实没有编译期约束。

实现：

- `apps/api/src/routes/schemas.routes.ts`
  - `SchemaRouteService` 返回类型从 `unknown` / `unknown[]` 收紧为 `ApiRouteResponseObject` / `ApiRouteResponseObject[]`。

- `apps/api/src/routes/providers.routes.ts`
  - `ProviderRouteService` 的 list/save/default/health 返回类型收紧为 route response object/list。

- `apps/api/src/routes/audit.routes.ts`
  - `AuditRouteService.listRecent()` 返回类型收紧为 `ApiRouteResponseObject[]`。

- `apps/api/src/services/api-services.ts`
  - `ProviderRegistry` route-facing 返回类型同步收紧，确保生产 service 装配不能再把 scalar provider 响应当合法类型。

- `apps/api/src/services/schema.service.ts`
  - route-facing schema repository 返回类型收紧为 `ApiRouteResponseObject`。
  - `SchemaValidationResult` 保持业务类型，`validateDraft()` 返回时展开为 route response object，避免把 core schema validator 类型外溢成 API route 类型。

- `apps/api/src/routes/schemas.routes.test.ts`
- `apps/api/src/routes/providers.routes.test.ts`
- `apps/api/src/routes/audit.routes.test.ts`
  - 仍保留 scalar service response 的运行时 500 guard，但改为显式 `as unknown as ...` unsafe cast，表明这些测试是在模拟绕过编译期的异常注入。

- `docs/superpowers/plans/2026-06-09-p1-p2-next-contract-security.md`
  - 记录本轮 brainstorming、计划、TDD 红绿和 verification-before-completion。

绿灯：

- `corepack pnpm --filter @medical-record-agent/api typecheck`：通过。
- `corepack pnpm vitest run apps/api/src/routes/route-service-contracts.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts`：通过，4 files passed，28 tests passed。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed / 14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，最终入口 `index-RRIirKAv.js`；无 500 kB JS chunk warning；最大 JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB。 |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm test` | 通过，70 passed / 1 skipped files；407 passed / 1 skipped tests；存在既有 Node `DEP0040 punycode` warning。 |
| `curl -I --max-time 5 http://localhost:9901/` | 200 OK；`Last-Modified: Tue, 09 Jun 2026 10:16:19 GMT`。 |
| `curl --max-time 5 http://localhost:9901/api/health` | 200 OK；`{"status":"ok","service":"medical-record-agent-api"}`。 |
| `rg 'assets/index-|vendor-arco-' apps/demo-web/dist/index.html` | dist 引用 `/assets/index-RRIirKAv.js` 与 `/assets/vendor-arco-_4u-J6Qa.js`。 |
| `ls -l apps/demo-web/dist/index.html apps/demo-web/dist/assets/index-RRIirKAv.js apps/demo-web/dist/assets/vendor-arco-_4u-J6Qa.js` | 文件存在，时间戳 2026-06-09 18:16。 |

## 分层结论

- UI 当前阶段：通过。本轮未修改医疗样式，Material + Arco Design 由 style/mobile/build 守卫继续验证。
- P1/P2 本轮阶段：通过。schemas/providers/audit route service response 类型边界完成编译期收敛，运行时 500 guard 仍保留。
- 真实外部集成：blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例 session invalidation store、真实 broker/queue、多实例 production smoke 未完成。
- 医疗最终产品：blocked。不能把 UI 当前阶段或本轮 contract/security 类型闭环写成医疗最终产品完成。

## 剩余问题

- 真实 production smoke 仍需外部 sandbox、真实凭据、真实密钥库、多实例 session store 和真实 broker 才能解除 blocked。
- 底层 repository 仍有部分 JSON/Prisma 边界需要分阶段继续收敛；本轮只处理 schemas/providers/audit route-facing response contract。
- 全量测试仍有既有 `DEP0040 punycode` warning，不是本轮新增失败。

本轮未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录。
