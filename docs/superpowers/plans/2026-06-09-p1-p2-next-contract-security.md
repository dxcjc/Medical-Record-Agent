# 2026-06-09 P1/P2 Next Contract Security

> 本轮按用户要求执行 superpowers 流程：brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion。

## Brainstorming

- 已读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md`、`MEDICAL-P2-PRODUCTION-CLOSURE-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTRACT-HARDENING-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTRACT-CLOSURE-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTRACT-READINESS-AUDIT-REPORT.md`。
- 前序已闭环或推进：UI/chunk、writeback client payload 丢弃、demo fallback、evaluation schema selection、schemas/providers/audit request DTO、provider/audit redaction、production smoke blocked 机器可读诊断。
- 本轮不重复这些项，选择当前环境可落地的剩余 P1/P2：schemas/providers/audit route service response 类型边界仍暴露为 `unknown`，运行时已有 guard，但编译期仍允许 route service 返回 scalar 或 scalar list。
- 真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、多实例 session store、真实 broker/queue、多实例 production smoke 仍按 blocked 处理。

## Writing Plans

- [x] 读取指定续接和审计报告，排除已完成 UI/chunk/writeback/demo/evaluation 工作。
- [x] 先写失败的编译期契约测试，证明 scalar schema/provider/audit service 仍能错误满足 route service 接口。
- [x] 将 schemas/providers/audit route service 返回类型收敛为 `ApiRouteResponseObject` / `ApiRouteResponseObject[]`。
- [x] 对少数“模拟坏 service 响应”的运行时测试改为显式 unsafe cast，保留 500 guard 覆盖。
- [x] 运行定向测试与 `corepack pnpm typecheck`。
- [x] 运行用户指定的 style/mobile/build/typecheck/test 和 9901/dist 检查。
- [x] 生成 fix report 与 7 维 audit report，分层写清 UI 当前阶段、P1/P2 本轮阶段、真实外部集成、医疗最终产品。

## TDD

红灯目标：新增 type contract 测试后，当前 `SchemaRouteService`、`ProviderRouteService`、`AuditRouteService` 的 `unknown` 返回类型会导致 `@ts-expect-error` 未被触发，`tsc` 应失败。

绿灯目标：收紧 route service 返回类型后，scalar service fixture 会被编译期拒绝；运行时 bad-service guard 测试仍可通过 unsafe cast 覆盖。

## Verification Before Completion

必须记录：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- 9901 首页和 `/api/health`
- `apps/demo-web/dist/index.html` 的新 bundle 引用和对应文件存在
