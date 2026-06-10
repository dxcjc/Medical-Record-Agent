# Medical Hard Remove Provider Final Scan

## Scope

本扫描用于二次验收收尾。扫描目标是用户/业务/当前文档主线；排除 `.test.*`、`.spec.*`、历史报告 `*REPORT.md`、本文件、任务 prompt/log、构建产物、缓存和 `node_modules`。

## Mainline Scan

命令使用用户指定六项禁词集合组成的 `FORBIDDEN_PATTERN`。为避免扫描报告本身成为非报告文件命中源，本文不重复写出禁词字面量。

本轮二次复验先复现了上一轮漏报：修复前，`docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md:318` 有 1 条 OCR Tool Node 旧流程残留，把真实 OCR provider 与旧模拟 OCR provider 并列为调用路径。该旧 spec 已标注为历史草案，本次没有伪造历史，只把当前流程节点改为真实 OCR provider，并把自动化验证限定为 OCR contract test double 或 fixture。

```bash
FORBIDDEN_PATTERN="<user-specified-forbidden-term-pattern>"
rg -n "$FORBIDDEN_PATTERN" apps docs README.md .env.example prisma scripts package.json packages \
  -g '!*.test.*' \
  -g '!*.spec.*' \
  -g '!*REPORT.md' \
  -g '!*.codex*' \
  -g '!**/node_modules/**' \
  -g '!**/dist/**' \
  -g '!**/.vite/**' \
  -g '!**/coverage/**'
```

修复前结果：1 命中，位置为 `docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md:318`。

修复后结果：无命中，`rg` exit code 1。

## Targeted Files

以下二次验收点已无命中：

- `apps/demo-web/src/api/normalizers.ts`
- `apps/api/src/services/api-services.ts`
- `docs/system-architecture.md`
- `docs/superpowers/specs/2026-06-04-medical-record-recognition-agent-design.md`
- `docs/superpowers/plans/2026-06-04-medical-record-agent-product.md`
- `docs/superpowers/plans/2026-06-09-remove-mock-line.md`
- `docs/architecture-teaching.html`
- `scripts/production-smoke.ts`
- `packages/core/src/providers/mockOcrProvider.ts`
- `packages/core/src/providers/mockModelProvider.ts`

## Remaining Wide-Scan Hits

全仓宽扫剩余命中仅属于以下豁免类别：

- 历史报告：`MEDICAL-HARD-REMOVE-MOCK-PROVIDER-*.md`、`MEDICAL-REMOVE-MOCK-LINE-*.md`、其他历史 `*REPORT.md`。
- 测试文件：`docs/hard-remove-mock-provider-user-surface.test.ts`、前端/API/core `.test.*`，用于验证旧 key、旧状态码和旧展示文案不会进入用户/业务主线。

未发现用户页面、业务 API 主线、README、当前架构文档、当前 superpowers 主线文档或非测试脚本残留。

## Verification Summary

- 本轮新鲜主线禁词扫描：0 命中，`rg` exit code 1。
- `http://127.0.0.1:9901/`：200 OK。
- `http://127.0.0.1:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。

上一轮较重验证记录如下，本轮未触及代码，仅做文档扫描和端点健康复核：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：19 passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：5 passed，14 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过。
- `corepack pnpm test`：407 passed，1 skipped。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm smoke:demo-web`：通过，`apiHealthOk=true`，`distBundleOk=true`。
- `http://127.0.0.1:9901/`：200 OK。
- `http://127.0.0.1:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
