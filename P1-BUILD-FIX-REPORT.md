# P1 Build Fix Report

生成时间：2026-06-08 23:06:41 CST

## 流程

- 按要求执行 `systematic-debugging -> TDD -> verification-before-completion`。
- systematic-debugging：先读取 TypeScript 报错、相关 DTO、路由解析和页面 helper，确认失败集中在写回输入契约漂移与可选 env 类型不匹配。
- TDD：以当前审计阻塞的 build/typecheck 错误和现有写回契约测试作为 RED；修复后用 `pnpm build`、`pnpm typecheck`、`pnpm test` 验证 GREEN。
- verification-before-completion：所有成功结论只基于本次新鲜命令输出。

## 根因

1. `ExecuteWritebackInput` / `ExecuteWritebackRouteInput` 已收敛为受控写回 DTO：`jobId`、`confirmed: true`、可选 `idempotencyKey`，服务端根据已验证的 RecognitionResult / readyFields 生成实际写回 payload。但部分测试仍按旧客户端契约传入 `payload`，导致 TypeScript excess property check 失败。
2. `VITE_DEMO_MODE` 是可选环境变量，但页面 helper 使用 `Pick<ImportMetaEnv, "VITE_DEMO_MODE">` 或不兼容的局部 env 类型，把可选字段变成必填/不兼容字段；在 `exactOptionalPropertyTypes` 下进一步暴露为 build 阻塞。
3. 给 `ImportMetaEnv` 补充可选 `VITE_DEMO_MODE` 后，`LoginPage` 的本地 env 类型也需要接受可选/undefined 值，否则默认 `import.meta.env` 不可赋给局部类型。

## 修复选择

- 不恢复客户端 `payload` 字段。理由：写回是高风险操作，当前路由测试和页面测试都要求“客户端只提交确认 DTO，真实 payload 由服务端已验证结果生成/执行”。恢复客户端 payload 会扩大篡改面，并与 `POST /writeback 丢弃客户端 fields/payload` 的安全契约冲突。
- 对测试输入做契约修正：前端 `executeWriteback()` 测试只发送 `jobId` 和 `confirmed: true`；api 生产装配测试直接调用 route service 时补齐 `confirmed` 与 `actor`，不再传客户端 payload。
- 对 env 做结构化类型修正：全局声明 `ImportMetaEnv.VITE_DEMO_MODE` 为可选；页面 helper 接收结构化 env，不使用 `any` 绕过类型检查。

## 修复文件

- `apps/demo-web/src/api/client.test.ts`：移除 `executeWriteback()` 测试里的旧 `payload` 输入与请求体断言。
- `apps/demo-web/src/pages/operations/WritebackPage.tsx`：修正 `isExplicitDemoMode()` 的 env 参数类型，保持 `VITE_DEMO_MODE` 可选。
- `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`：同上，修正详情页 demo mode helper 类型。
- `apps/demo-web/src/vite-env.d.ts`：声明可选 `VITE_DEMO_MODE`。
- `apps/demo-web/src/pages/auth/LoginPage.tsx`：同步本地 demo auth env 类型，兼容可选 `VITE_DEMO_MODE`。
- `apps/api/src/bootstrap/production-services.test.ts`：修正生产写回装配测试的 route service 输入，去掉旧 `payload`。

## 验证结果

- `cd /tmp/Medical-Record-Agent/apps/demo-web && pnpm build`：通过，退出码 0。Vite 仍提示 chunk 超过 500 kB，这是体积警告，不是失败。
- `cd /tmp/Medical-Record-Agent && pnpm typecheck`：通过，退出码 0。
- `cd /tmp/Medical-Record-Agent && pnpm test`：通过，退出码 0。55 个测试文件通过、1 个跳过；266 个测试通过、1 个跳过。存在 Node `punycode` deprecation warning，不影响结果。

## 429/502

本次验证命令均为本地 build/typecheck/test，未遇到上游 429 或 502。
