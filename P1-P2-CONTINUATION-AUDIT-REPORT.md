# P1/P2 Continuation Audit Report

生成时间：2026-06-09 02:46:41 CST / Asia/Shanghai

## 1. 产品概述（定位、目标用户、核心价值）

Medical Record Agent 是面向医疗病历图片、PDF、扫描件和 OCR 文本的结构化识别与治理工作台。产品围绕 Schema 版本、Provider 配置、LangGraph 识别编排、字段证据、人工复核、Evaluation 和 LIMS 写回，提供可审计的医疗数据处理链路。

目标用户：
- 临床数据录入与复核人员：上传病历、查看字段候选、证据、置信度并提交反馈。
- LIMS/医疗检验运维人员：维护 Provider、Schema、写回策略和审计日志。
- 数据科学与评测人员：导入脱敏评估集、运行字段级评估、比较模型与 Schema 版本。
- 系统管理员和安全负责人：管理权限、审计高风险操作、控制真实 OCR/LLM/LIMS 集成。

核心价值：
- 非结构化病历到结构化字段候选，并保留证据链和置信度。
- Schema 版本化和写回映射降低字段变更风险。
- Evaluation 验证模型、Provider、Schema 变更效果。
- 权限、审计、幂等、二次确认约束 LIMS 写回等高风险动作。

## 2. 功能完整性（页面/功能/实现状态）

页面状态：
- 登录、AppShell、识别看板、新建识别、任务详情、Schema Studio、Evaluation、Feedback、Provider、Writeback、Agent Trace、Audit、Dataset Spec 均有页面承载。
- UI 当前阶段保持 Material + Arco Design 企业级边界：Primary `#3370FF`、背景 `#F7F8FA`、白色侧栏、active nav pill、DM Sans + Noto Sans SC、移动端抽屉/单列/44px 触摸区。
- 详情页和写回页仅在显式 `VITE_DEMO_MODE=true` 时展示静态演示数据；非 demo mode API 失败展示失败空态，不静默展示假数据。

后端/API 状态：
- 生产文件上传校验 base64/SHA-256 并写入受控存储。
- 生产识别使用 Provider/schema resolution 后同步执行 core 编排并落库 RecognitionResult。
- 默认 demo API 已从“任意 jobId 固定假结果”改为创建任务后运行 mock OCR/LLM/validation 编排，并按 jobId 保存 result。
- 写回路由只接受 `jobId + confirmed + idempotencyKey`；生产 executor 对手动写回重新读取服务端 job/result readyFields。
- Provider 保存、默认设置、health、secretRefs 脱敏已覆盖；真实密钥库仍未完成。
- Evaluation 数据集、样本、run、metrics API 存在；生产 runner 仍未按 run schemaKey/schemaVersion 动态解析 schema。

## 3. 业务流程完整性（核心流程是否闭环）

识别流程：
- 前端新建识别会构造真实文件上传 DTO，带 base64、SHA-256、schema/provider、隐私选项。
- 本轮补齐本地文件读取/哈希 AbortSignal，取消能中断本地阶段，取消后可重跑上一次配置。
- 默认 demo API 现在会跑 mock core 编排并绑定 jobId/result，演示闭环更可信。
- 生产路径仍同步执行 OCR/LLM，未引入后台队列；真实大文件或慢 provider 仍有请求超时风险。

Schema 流程：
- 草稿、校验、发布、停用、回滚、比较均有页面/API入口。
- 本轮发布动作补齐二次确认，点击发布不再直接调用发布 API；确认后才执行。

写回流程：
- 前端写回只提交确认 DTO，不携带 fields/payload。
- 本轮修复生产 executor：手动写回从服务端持久化 RecognitionResult 的 `payload.writeback.readyFields` 构造 LIMS payload，并检查 job 状态、reviewRequired、readyFields 和阻塞 attempt。
- 自动编排内部写回仍可使用刚生成的 readyFields。
- 外部 LIMS sandbox smoke 未执行，不能认定真实 LIMS 集成验收通过。

Evaluation 流程：
- 前端 run 创建携带 schemaKey/providerKey/sampleLimit；样本导入生成字段级 groundTruth。
- 服务层保存 `schemaConfig.schemaKey`。
- 生产 runner 仍固定 `limsClinicalInfoSchema`，未消费 `runInput.schemaConfig` 动态解析 schema；该项未闭环。

## 4. 用户体验（性能、交互、错误处理、移动端）

已修/确认：
- Schema 发布、停用、回滚均有二次确认弹窗和危险文案。
- 识别创建、Evaluation run、样本导入、写回执行具备 loading/cancel/rerun 状态。
- 详情页真实 API 失败不会显示静态假数据；写回页非 demo mode eligible 加载失败不会展示演示候选。
- style/mobile guard 通过，移动端 UI 边界保持。
- build 产物路由 lazy loading，最终无 500k JS chunk 警告。

剩余风险：
- `corepack pnpm --filter @medical-record-agent/demo-web build` 出现 Arco manualChunks circular chunk 提示，构建成功但可继续优化打包边界。
- 没有真实浏览器截图/E2E 验证，移动端和交互主要靠静态/单元 guard。
- API 生产识别同步执行，长任务 UX 与真实后台状态仍不完全一致。

## 5. 技术实现（代码质量、API 完整性、数据模型）

本轮技术改动：
- 新增 `apps/demo-web/src/api/normalizers.ts`，集中 schema/provider/evaluation/recognition/writeback/trace API response normalizer。
- 页面层移除主要 `response: unknown`、`job: unknown`、`result: unknown` 后端 shape 兼容逻辑，unknown 保留在错误处理和 JSON/payload 边界。
- `apps/api/src/bootstrap/production-services.ts` 的手动 confirmed writeback 路径重新读取 Prisma job/result，并从服务端 readyFields 构造 payload。
- `apps/api/src/demo-services.ts` 使用 core mock OCR/LLM/validation 编排建立 demo job/result 闭环。
- `apps/demo-web/src/utils/fileContent.ts` 支持 AbortSignal。
- `apps/demo-web/vite.config.ts` 继续拆分 Arco vendor chunk，避免单个 JS chunk 超 500k。

数据模型/API 状态：
- Prisma 已有 RecognitionJob、RecognitionResult、SchemaDraft、SchemaVersion、WritebackAttempt、EvaluationRun 等核心模型。
- `EvaluationRun.schemaVersionId` 模型存在，但当前服务创建 run 仍主要保存 JSON `schemaConfig`，生产 runner 未关联具体 SchemaVersion。
- Provider secretRefs 已作为密钥引用保存并脱敏返回；真实 KMS/Vault 解析注入未实现。
- 安全错误响应有稳定 code，Provider 路由测试覆盖 secretRefs 不泄露；完整 CSP/rate limit/session 策略仍不足。

## 6. 问题清单（P0/P1/P2）

P0：
- 未发现当前阻断构建/测试的 P0。demo-web build 通过，根测试通过，9901 可访问。

P1-已修：
- P1-3 Schema 发布缺少二次确认：已修。文件：`apps/demo-web/src/pages/schema/SchemaStudioPage.tsx`。影响：误点击发布生产 Schema。验证：`SchemaStudioPage.test.ts`。
- P1-6 页面 API response shape 分散：已阶段修复。文件：`apps/demo-web/src/api/normalizers.ts` 及相关页面。影响：页面直接维护后端 shape 漂移。验证：typecheck、页面定向测试、静态 rg 无匹配。
- P1-6 生产写回装配漂移：已修。文件：`apps/api/src/bootstrap/production-services.ts`。影响：手动写回可能写入空 payload 或客户端伪造 payload。验证：`production-services.test.ts`。
- P1-8 识别本地文件处理不可取消：已修。文件：`apps/demo-web/src/utils/fileContent.ts`、`NewRecognitionPage.tsx`。影响：取消后本地读取/哈希仍运行。验证：`fileContent.test.ts`、`NewRecognitionPage.test.ts`。
- 默认 demo API 不闭环：已阶段修复。文件：`apps/api/src/demo-services.ts`。影响：默认体验无法验证 jobId/result 关联。验证：`demo-services.test.ts`。

P1-未完成：
- Evaluation production runner schema 解析未闭环。文件：`apps/api/src/bootstrap/production-services.ts` `createProductionEvaluationRunner()`，`apps/api/src/services/api-services.ts` `createRun()`。影响：用户创建 run 传入 schemaKey 后，生产 runner 仍固定 LIMS 内置 schema，评测结果可能不是目标 schema。建议：复用生产识别 schema resolution，按 `schemaConfig.schemaKey/schemaVersionId` 找 active schema，并将实际 schemaVersionId 写入 run/metrics。
- Production smoke 未配置。文件：`scripts/production-smoke.ts`。影响：真实外部 OCR/LLM/LIMS/API 集成没有可执行验收结果。建议：配置 `PRODUCTION_SMOKE_BASE_URL`、测试账号/API token、Provider/LIMS sandbox 后纳入 CI。
- 生产异步任务队列未完成。文件：`apps/api/src/services/api-services.ts` jobService.create。影响：生产识别同步等待 OCR/LLM，真实慢 provider 下可能超时。建议：引入队列/worker，`POST /jobs` 只入队返回 jobId，前端轮询/订阅状态。

P2：
- 密钥库未完成。文件：`apps/api/src/bootstrap/production-services.ts` provider runtime，`apps/api/src/repositories/provider.repository.ts`。影响：secretRefs 未接 KMS/Vault/Secret Manager 动态解析。建议：只保存引用，运行时按权限解析并注入 headers，health 不回显 secret。
- 浏览器 E2E 未完成。文件：`scripts/demo-web-basic-e2e.ts` 仅 helper。影响：上传、详情、反馈、写回、移动端抽屉未经过真实浏览器验收。建议：增加 Playwright smoke 和截图断言。
- 安全基线需增强。文件：`apps/api/src/server.ts`、auth/JWT、前端 auth。影响：CSP、rate limit、HttpOnly cookie/refresh token 轮换、登出失效未完整产品化。建议：按生产安全基线逐项落地。
- Arco manualChunks circular chunk 提示。文件：`apps/demo-web/vite.config.ts`。影响：构建成功但打包依赖图有循环提示。建议：后续按实际导入组件做更细的按需 import 或调整 chunk 分组。

## 7. 验收结论（通过/不通过 + 改进建议）

结论：P1 打回项阶段通过；医疗项目整体不通过最终产品验收。

通过依据：
- P1-AUDIT 打回项 P1-3、P1-6、P1-8 均已修复并有测试覆盖。
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`：通过，11 tests passed。
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`：通过，1 passed、10 skipped。
- `corepack pnpm --filter @medical-record-agent/demo-web build`：通过，无 500k JS chunk 警告；最终入口 `/assets/index-DiLMJJKr.js`。
- `corepack pnpm test`：通过，62 passed、1 skipped；291 passed、1 skipped。
- `http://localhost:9901/`：200 OK，返回最新 dist HTML。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- `apps/demo-web/dist/index.html` 与 9901 返回 HTML 均引用 `/assets/index-DiLMJJKr.js`。

不通过最终验收的原因：
- `corepack pnpm smoke:production` 因 `PRODUCTION_SMOKE_BASE_URL` 未配置失败，真实外部集成环境未配置，不能视为外部集成验收通过。
- Evaluation production runner 未按 schemaKey/schemaVersion 动态解析 schema。
- 生产异步任务队列、密钥库、浏览器 E2E、安全基线仍未闭环。

改进建议优先级：
1. 修复 Evaluation runner schema resolution，并补 production runner 测试。
2. 配置可重复的 production smoke 环境，接入真实/sandbox OCR、LLM、LIMS。
3. 引入异步任务队列和状态轮询，避免同步长任务。
4. 接入密钥库并完善 CSP/rate limit/session 安全基线。
5. 增加 Playwright 浏览器 E2E 与移动端截图验收。
