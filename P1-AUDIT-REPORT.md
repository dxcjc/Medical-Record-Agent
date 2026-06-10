# P1 Audit Report

生成时间：2026-06-08 23:37:51 CST / +0800

## 最终结论

不通过

## 流程记录

- 已按用户指定顺序执行 `requesting-code-review -> verification-before-completion`。
- 仓库内未发现 `CLAUDE.md`；已读取本机 superpowers-zh 指南 `/home/ubuntu/.npm/_npx/b45846acb10a9395/node_modules/superpowers-zh/CLAUDE.md`。
- 已读取 `requesting-code-review` 与 `verification-before-completion` 技能说明。
- 已派发独立只读审查上下文复核 P1-1 到 P1-8；独立审查同样指出 P1-3 发布缺少二次确认、P1-6 页面本地 API shape 仍分散、P1-8 识别本地文件处理不可取消。
- 本报告不沿用旧 `P1-AUDIT-REPORT.md` 结论；build/typecheck/test 阻断已用本轮新鲜命令重新验证。

## 新鲜验证命令

1. `cd /tmp/Medical-Record-Agent/apps/demo-web && pnpm build`
   - 结果：通过，退出码 0。
   - 证据：`tsc -p tsconfig.json --noEmit && vite build` 完成，`2456 modules transformed`，`built in 8.10s`。
   - 备注：Vite 仍提示 chunk 超过 500 kB，这是体积警告，不是失败。

2. `cd /tmp/Medical-Record-Agent && pnpm typecheck`
   - 结果：通过，退出码 0。
   - 证据：`packages/shared typecheck: Done`、`packages/core typecheck: Done`、`apps/demo-web typecheck: Done`、`apps/api typecheck: Done`，随后 `tsc -p tsconfig.scripts.json` 完成。

3. `cd /tmp/Medical-Record-Agent && pnpm test`
   - 结果：通过，退出码 0。
   - 证据：`Test Files 55 passed | 1 skipped (56)`，`Tests 266 passed | 1 skipped (267)`。
   - 备注：存在 Node `DEP0040 punycode` deprecation warning，不影响退出码。

## P1 逐项审计

### P1-1 App.tsx 入口规范

判定：通过

证据：
- `apps/demo-web/src/App.tsx:25` 使用 `createBrowserRouter` 定义登录、受保护路由、Shell 子路由和 404。
- `apps/demo-web/src/App.tsx:56` 的 `App` 统一承载 Arco `ConfigProvider`、`QueryClientProvider`、`AuthProvider`、`RouterProvider`。
- `apps/demo-web/src/main.tsx:7` 到 `apps/demo-web/src/main.tsx:18` 只负责查找 `root`、缺失时报错、挂载 `<App />`。

### P1-2 顶部搜索、通知、CSV、残留无动作按钮

判定：通过

证据：
- 顶部搜索：`apps/demo-web/src/layouts/AppShell.tsx:108` 的 `findNavigationSearchTarget()` 解析导航项；`apps/demo-web/src/layouts/AppShell.tsx:205` 的 `handleTopbarSearch()` 命中后 `navigate(target.to)`。
- 搜索测试：`apps/demo-web/src/layouts/AppShell.test.ts:27` 覆盖按页面标签和权限关键词跳转；`apps/demo-web/src/layouts/AppShell.test.ts:32` 覆盖空搜索和无匹配不返回假目标。
- 通知中心：`apps/demo-web/src/layouts/AppShell.tsx:121` 到 `apps/demo-web/src/layouts/AppShell.tsx:137` 实现已读、全部已读、打开真实路由；`apps/demo-web/src/layouts/AppShell.tsx:365` 到 `apps/demo-web/src/layouts/AppShell.tsx:379` 提供全部已读和打开相关页面按钮。
- 通知测试：`apps/demo-web/src/layouts/AppShell.test.ts:56`、`:63`、`:76` 覆盖幂等已读、打开真实路由、全部已读。
- CSV：`apps/demo-web/src/pages/operations/AuditLogPage.tsx:131` 构建 CSV，`apps/demo-web/src/pages/operations/AuditLogPage.tsx:215` 到 `:232` 创建 `Blob`、对象 URL、下载链接并导出当前筛选结果。
- CSV 测试：`apps/demo-web/src/pages/operations/AuditLogPage.test.ts:5` 覆盖 CSV header、逗号和引号转义。
- CSV 按钮门禁：`apps/demo-web/src/pages/operations/AuditLogPage.tsx:189` 计算 `canExportCsv`；`apps/demo-web/src/pages/operations/AuditLogPage.tsx:253` 到 `:260` 无数据或加载中禁用导出。

残余风险：
- `apps/demo-web/src/pages/recognition/components/RecognitionShared.tsx:163` 到 `:172` 的 `SectionTitle` 仍保留 `actionLabel` 分支，若未来调用方只传 `actionLabel` 会渲染无 `onClick` 按钮。当前 `rg` 未发现页面传入 `actionLabel`，不构成本轮 P1 阻断。

### P1-3 Schema 危险操作门禁

判定：不通过

通过部分证据：
- 停用/回滚已有二次确认：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx:709` 和 `:711` 点击停用/回滚只设置 `pendingDangerAction`。
- 真实停用/回滚 API 只在确认弹窗 `onConfirm` 后调用：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx:746` 到 `:763`。
- 后端发布、停用、回滚均需要 `schema:publish`：`apps/api/src/routes/schemas.routes.ts:133` 到 `:190`。
- 服务层危险动作再次校验权限并写审计：`apps/api/src/services/schema.service.ts:212` 到 `:258` 发布；`:261` 到 `:287` 回滚；`:289` 到 `:306` 停用。
- 路由测试覆盖缺少 `schema:publish` 时拒绝发布：`apps/api/src/routes/schemas.routes.test.ts:178` 到 `:193`。

阻断证据：
- 页面自身把发布、停用、回滚都定义为生产影响动作：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx:637` 到 `:642` 写明“发布、停用或回滚前请确认验证结果和业务窗口”。
- 但发布按钮仍直接触发 `onPublish`：`apps/demo-web/src/pages/schema/components/SchemaFlowPanel.tsx:73` 到 `:82`。
- `onPublish` 直接绑定 `handlePublishDraft`：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx:697` 到 `:709`。
- `handlePublishDraft()` 直接调用 `api.publishSchemaDraft()`，没有进入 `ConfirmDialog`：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx:545` 到 `:558`。

影响：
- 发布属于生产 Schema 变更，但 UI 层缺少与停用/回滚同级的二次确认门禁；误点击即可发起真实发布 API。

### P1-4 Provider 保存、持久化、Health Check

判定：通过

证据：
- 前端保存 DTO 集中生成：`apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx:236` 到 `:255`。
- 保存调用真实 Provider API：`apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx:375` 到 `:393` 使用 `api.saveProviderConfig()` 并保存后 `loadProviders()` 刷新真实列表。
- 本地草稿持久化和坏数据过滤：`apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx:188` 到 `:217`；写入 localStorage 见 `:228` 到 `:234`。
- Health Check 使用后端返回 provider key：`apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx:323` 到 `:348` 从 `apiProviders` 匹配真实 provider 后调用 `api.checkProviderHealth(provider.key)`。
- 后端保存/健康检查路由：`apps/api/src/routes/providers.routes.ts:150` 到 `:203` 保存配置，`:205` 到 `:237` 健康检查。
- secret 脱敏：`apps/api/src/routes/providers.routes.ts:51` 到 `:80`；测试见 `apps/api/src/routes/providers.routes.test.ts:86` 到 `:135`、`:212` 到 `:263`、`:265` 到 `:351`。
- API client 测试覆盖保存和 health endpoint：`apps/demo-web/src/api/client.test.ts:435` 到 `:464`、`:466` 到 `:510`。

残余风险：
- 前端 Health Check 通过 kind/key 模糊匹配区域：`apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx:163` 到 `:178`。建议补“保存 key -> 刷新列表 -> 同 key health check”的集成型测试，但当前实现已满足 P1 基线。

### P1-5 评估中心真实样本解析

判定：通过

证据：
- 真实 Schema/Provider 选项读取：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:451` 到 `:481`。
- 评估 run 请求携带 `datasetId`、`schemaKey`、`providerKey`、`sampleLimit`：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:353` 到 `:361`。
- 样本导入生成字段级 `groundTruth`，不是空对象：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:364` 到 `:389`。
- 导入调用后端 samples API 并透传 `AbortSignal`：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:730` 到 `:741`。
- 前端测试覆盖真实 schema/provider 解析、run 请求和字段级 groundTruth：`apps/demo-web/src/pages/evaluation/EvaluationPage.test.ts:11`、`:30`、`:47`、`:63`。
- 后端评估路由校验 run body 和 samples body：`apps/api/src/routes/evaluation.routes.ts:59` 到 `:78`、`:101` 到 `:103`、`:157` 到 `:177`、`:201` 到 `:230`。
- 服务层导入前校验数据集脱敏并禁止真实未脱敏样本：`apps/api/src/services/api-services.ts:741` 到 `:765`；导入时持久化 `groundTruth` 和 metadata：`apps/api/src/services/api-services.ts:833` 到 `:853`。

残余风险：
- 当前前端导入面板是单条最小样本编辑流，不是完整 CSV/JSONL 文件解析器。按本轮 P1-5“真实样本解析、不提交空 groundTruth”的验收口径已通过。

### P1-6 前后端契约类型集中、unknown 边界、页面本地 API shape 迁移

判定：不通过

通过部分证据：
- 前端集中 API 类型已建立：`apps/demo-web/src/api/types.ts:9` 到 `:463` 覆盖 JSON、schema、provider、evaluation、recognition、feedback、writeback、audit。
- `ExecuteWritebackInput` 已收敛为 `jobId`、`confirmed: true`、可选 `idempotencyKey`，不允许客户端 payload：`apps/demo-web/src/api/types.ts:409` 到 `:413`。
- API client 方法返回值不再是 `unknown`：`apps/demo-web/src/api/client.ts:190` 到 `:363`；类型测试见 `apps/demo-web/src/api/client.test.ts:31` 到 `:64`。
- 写回 client 测试只发送确认 DTO：`apps/demo-web/src/api/client.test.ts:388` 到 `:413`。
- 后端 `/writeback` 路由丢弃客户端 `fields/payload`，只把确认 DTO 和 actor 交给服务层：`apps/api/src/routes/writeback.routes.ts:34` 到 `:50`、`:107` 到 `:125`；测试见 `apps/api/src/routes/writeback.routes.test.ts:127` 到 `:166`。

阻断证据 1：页面本地 API shape 仍未迁移到集中 mapper/normalizer。
- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:89` 的 `parseEvaluationSchemaOptions(response: unknown)`。
- `apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:112` 的 `parseEvaluationProviderOptions(response: unknown)`。
- `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx:90` 的 `parseSchemaOptions(response: unknown)`。
- `apps/demo-web/src/pages/recognition/JobDetailPage.tsx:372` 的 `parseApiDetail(job: unknown, result: unknown)`。
- `apps/demo-web/src/pages/operations/WritebackPage.tsx:231` 的 `normalizeApiJobToWritebackJob(job: unknown, result: unknown)`。

这些 `unknown` 不只是 JSON.parse/错误/外部 payload 边界，而是页面直接维护后端响应形状兼容逻辑；“页面本地 API shape 迁移”仍不完整。

阻断证据 2：生产写回契约仍有服务装配漂移。
- `createApiServices()` 内部的安全写回服务会从持久化 result 读取 readyFields 并构造 payload：`apps/api/src/services/api-services.ts:1075` 到 `:1097`。
- 但生产装配覆盖了该服务：`apps/api/src/bootstrap/production-services.ts:1465` 到 `:1470` 将 `writebackService.execute` 替换为 `productionWritebackExecutor`。
- `createProductionWritebackExecutor()` 读取的是入参 `body.fields` / `body.payload`：`apps/api/src/bootstrap/production-services.ts:1480` 到 `:1497`。
- `/writeback` 路由按当前安全契约只传 `jobId`、`confirmed`、`idempotencyKey`、`actor`：`apps/api/src/routes/writeback.routes.ts:122` 到 `:125`。
- 生产装配测试实际证明手动写回 payload 为空：`apps/api/src/bootstrap/production-services.test.ts:248` 到 `:269` 断言 adapter 收到 `payload: {}`。

影响：
- 手动 `/writeback` 生产路径与“服务端根据已验证 readyFields 写回”的契约不一致。构建已通过，但真实写回行为仍可能在生产服务装配层丢失字段。

### P1-7 认证 demo 兜底生产守卫

判定：通过

证据：
- demo 凭据只在开发或显式 demo env 下预填：`apps/demo-web/src/pages/auth/LoginPage.tsx:16` 到 `:18`。
- 生产默认邮箱和密码为空：`apps/demo-web/src/pages/auth/LoginPage.tsx:20` 到 `:32`。
- 测试覆盖生产不预填和开发/demo 预填：`apps/demo-web/src/pages/auth/LoginPage.test.ts:6` 到 `:20`。
- 前端登录调用真实 `/auth/login`：`apps/demo-web/src/auth/AuthContext.tsx:51` 到 `:60`。
- 后端登录路由校验输入并调用认证服务：`apps/api/src/routes/auth.routes.ts:16` 到 `:43`。
- 认证服务使用用户仓库、bcrypt 校验和 JWT 签发：`apps/api/src/auth/auth.service.ts:127` 到 `:160`。

残余风险：
- `VITE_DEMO_AUTH_ENABLED=true` 在 production 仍会显式开启预填，这是有意保留的 demo 开关；生产发布需要部署层禁止该变量。

### P1-8 长任务状态机 UX 与取消/重跑测试覆盖

判定：不通过

通过部分证据：
- 评估 run 创建有状态、取消、重跑：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:659` 到 `:716`；UI 按钮见 `apps/demo-web/src/pages/evaluation/components/EvaluationRunPanel.tsx:99` 到 `:112`。
- 样本导入有状态、取消、重跑：`apps/demo-web/src/pages/evaluation/EvaluationPage.tsx:730` 到 `:786`；UI 按钮见 `apps/demo-web/src/pages/evaluation/components/SampleImportPanel.tsx:111` 到 `:122`。
- 写回有二次确认、执行中、取消恢复、重跑上一次任务：`apps/demo-web/src/pages/operations/WritebackPage.tsx:485` 到 `:519`，后续 UI 提供取消/重跑。
- API client 测试覆盖长任务 `AbortSignal` 透传到底层 fetch：`apps/demo-web/src/api/client.test.ts:276` 到 `:338`。

阻断证据：
- 识别创建在传入 fetch signal 前先执行本地 base64 和 SHA-256：`apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx:359` 到 `:369`。
- `buildRecognitionFileUploadInput()` 不接收 `AbortSignal`：`apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx:182` 到 `:206`。
- 底层 `blobToBase64()` 和 `blobSha256Hex()` 不接收 `AbortSignal`，也不检查 abort：`apps/demo-web/src/utils/fileContent.ts:5` 到 `:13`、`:29` 到 `:35`。
- 识别页虽有取消/重跑按钮：`apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx:613` 到 `:618`，但取消只能影响后续 fetch，不能中断本地文件读取和哈希。
- 识别页测试只覆盖 payload 构造、真实 checksum/base64 和文件校验：`apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts:54` 到 `:131`；没有覆盖本地读取/哈希取消。

影响：
- 对最大 20MB 病历文件，用户点击取消后，本地读取、base64 编码和 SHA-256 仍可能继续运行；P1-8 的“取消/重跑测试覆盖”不完整。

## 打回清单

1. P1-3：给 Schema 发布动作补与停用/回滚同级的二次确认门禁；点击“发布”只能打开确认弹窗，确认后才调用 `api.publishSchemaDraft()`；补测试证明未确认时不会调用发布 API。
2. P1-6：把页面内 API response shape 解析迁移到集中 API mapper/normalizer 层。页面不应直接维护 `response: unknown`、`job: unknown`、`result: unknown` 的后端 shape 兼容逻辑；保留 `unknown` 在 JSON 入口、错误响应、外部 payload 入口。
3. P1-6：修复生产写回装配漂移。`/writeback` 生产路径必须使用服务端持久化 RecognitionResult / readyFields 构造 payload，不能依赖 executor 入参 `fields/payload`；补生产装配测试，断言手动 `/writeback` 会把服务端 readyFields 写入 LIMS adapter，而不是 `payload: {}`。
4. P1-8：让 `buildRecognitionFileUploadInput()`、`blobToBase64()`、`blobSha256Hex()` 或等价调用链接收 `AbortSignal`，在每个异步阶段前后检查并抛出 `AbortError`；补识别创建取消和重跑测试。

## 2026-06-09 产品级 7 维归档复审

### 1. 产品概述

本报告原始结论是 2026-06-08 晚间的 P1 打回审计。归档复审按当前工作区重新对齐：Medical Record Agent 是面向病历识别、Schema 治理、Evaluation、Provider、写回、安全审计和生产交接的医疗工作台。P1 打回项是否已修复只代表本地代码/测试层面的阶段状态，不代表真实外部医疗产品最终验收。

### 2. 功能完整性

原始打回项后续覆盖状态：

- P1-3 Schema 发布危险操作门禁：已由 `SchemaStudioPage.tsx` 的 publish pending danger action 和 `SchemaStudioPage.test.ts` 覆盖。
- P1-6 页面 API shape 集中化：`apps/demo-web/src/api/normalizers.ts` 已承接页面响应兼容逻辑；本轮 `rg` 检查页面和 api 中 `parse.*unknown|job: unknown|result: unknown|response: unknown` 无匹配。
- P1-6 生产写回可信边界：`createProductionWritebackExecutor()` 在 `confirmed=true` 路径重读 job/result/readyFields；测试断言客户端伪造诊断未进入 LIMS payload。
- P1-8 识别本地文件处理取消：`blobToBase64()`、`blobSha256Hex()`、`buildRecognitionFileUploadInput()` 已接收 `AbortSignal`，测试覆盖 AbortError 和取消后重跑。

同时，PRODUCT-AUDIT 中多个旧问题已被后续推进：demo API job/result 闭环、非 demo 静态 fallback 禁用、Evaluation schema selection、浏览器 E2E 脚本、session/queue/secret resolver contract。

### 3. 业务流程完整性

当前本地/P1 业务链路更完整：Schema 发布要二次确认；识别创建可取消并重跑；demo API 结果按 jobId 关联；写回执行服务端复核 readyFields；Evaluation production runner 按 run schema 解析 active/schemaVersion；API 契约通过 normalizer 和集中类型降低漂移。

仍不完整的生产闭环：真实 OCR/LLM/LIMS sandbox、真实生产密钥库、生产多实例 session invalidation store、真实 broker/worker 多实例可靠队列和真实 production smoke 尚未通过。

### 4. 用户体验

P1 UX 风险已下降：生产默认不预填 demo 凭据，前端生产默认不把 JWT 持久化到 localStorage，登录使用 HttpOnly `mra_session` cookie；识别长任务可取消/重跑；非 demo mode 下详情/写回 API 失败显示真实失败态而不是静态演示数据；移动端和 UI guard 通过。

但真实浏览器 E2E 仍是本地路由/移动布局验收，不能替代真实医疗外部 sandbox 验收。

### 5. 技术实现

关键当前实现：

- `apps/api/src/routes/writeback.routes.ts` 只将确认 DTO 与 actor 交给服务层。
- `apps/api/src/bootstrap/production-services.ts` 在 production writeback executor 中重新读取 `RecognitionJob`、`RecognitionResult` 和 `payload.writeback.readyFields`。
- `apps/api/src/bootstrap/production-services.ts` 的 `resolveProductionRecognitionSchema()` 与 `createProductionEvaluationRunner()` 支持按 `schemaKey/schemaVersionId` 解析 schema。
- `apps/api/src/services/api-services.ts` 引入 in-process queue contract 和 Redis broker adapter skeleton；`/status` 可暴露 queue posture。
- `apps/api/src/auth/auth.service.ts` 引入 session invalidation store contract，默认 in-memory 明确 `productionReady=false`。
- `scripts/production-smoke.ts` 区分 `passed|blocked|failed`。

### 6. 问题清单（P0/P1/P2）

P0：
- 当前未发现 typecheck/build/test/9901 阻断级 P0。

P1：
- 已闭环：本报告原始 P1-3、P1-6、P1-8 打回项。
- 已推进：demo API 闭环、静态 fallback 门禁、Evaluation schema 解析、production smoke blocked 分类、浏览器 E2E 脚本。
- 仍 blocked：真实 production smoke 未配置外部 sandbox，不能验证真实 OCR/LLM/LIMS。

P2：
- 已推进：异步任务队列 contract、Redis broker skeleton、secret resolver contract、session invalidation repository contract、deployment readiness gate 和 handoff。
- 仍 blocked：真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列、真实外部 smoke。
- 残余：`punycode` deprecation warning；数据库集成测试 skipped。

### 7. 验收结论

本轮复验结果：

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，18 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，5 passed、13 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，入口 `/assets/index-DDGZMq2H.js`，无 500 kB JS warning。
- `corepack pnpm test`：通过，67 passed、1 skipped；367 passed、1 skipped。
- `corepack pnpm smoke:production`：exit code 2，`STATUS blocked`，缺真实 sandbox、真实密钥库、生产多实例 session store、真实 broker。
- 9901 `/`：200 OK；9901 `/api/health`：200 OK；dist 与 9901 HTML 均引用 `/assets/index-DDGZMq2H.js`。

复审结论：原始 P1 打回项按当前代码与测试可判定阶段通过；P1/P2 业务/安全/集成推进为部分通过；真实外部集成和医疗最终产品仍 blocked，不能写通过。
