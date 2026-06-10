# Medical P1/P2 Continuation Rollup Audit Report

生成时间：2026-06-09 CST / Asia/Shanghai

本轮按用户要求执行 `brainstorming -> writing-plans -> TDD/测试优先 -> verification-before-completion`。已先读取 `.codex-medical-p1-p2-continuation.md`、`PRODUCT-AUDIT-REPORT.md`、`MEDICAL-P1-P2-CONTINUATION-ROLLUP-AUDIT-REPORT.md`、最新 `MEDICAL-P2-SESSION-QUEUE-HARDENING-AUDIT-REPORT.md`、`MEDICAL-P2-SESSION-QUEUE-HARDENING-FIX-REPORT.md`、`MEDICAL-P2-TYPECHECK-AUDIT-REPORT.md`、`MEDICAL-P2-TYPECHECK-FIX-REPORT.md`。

本轮未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录。

## 1. 产品概述

Medical Record Agent 是面向病历图片、PDF、扫描件和 OCR 文本的医疗结构化识别与治理工作台。产品主线覆盖文件上传、OCR/LLM 编排、Schema 管理、字段证据、人工反馈、Evaluation、LIMS 写回、Provider 运维、安全审计和生产 readiness。

本轮目标不是宣布医疗最终完成，而是继续闭环当前环境可落地的 P1/P2 非外部依赖项：API route/service DTO 收敛、production smoke blocked 可诊断性、production readiness gate 分层。

分层总览：

- UI 当前阶段：通过。
- P1/P2 本轮可落地项：通过。
- 真实外部集成：blocked。
- 医疗最终产品：blocked。真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store、真实 broker 多实例可靠队列和真实 production smoke 全部完成前，不得写通过。

## 2. 功能完整性

本轮新增/补强：

- API route DTO：新增 `apps/api/src/routes/route-dtos.ts`，用 Zod 收敛 files、jobs、feedback、evaluation samples 的请求 DTO。
- API response contract：`apps/api/src/services/api-services.ts` 对 files/jobs/feedback/evaluation 的 route response 做对象/对象数组边界校验。
- Files：`POST /files` 非法 body 返回 400；剥离 `uploadedById/storageKey` 等客户端伪造字段。
- Jobs：`POST /jobs` 非法 body 返回 400；只允许 schema、source file、document、options、provider key 白名单；不接收客户端 secret。
- Feedback：`POST /feedback` 非法 body 返回 400；支持 `field`/`fieldKey` 归一化，剥离 `createdById`。
- Evaluation samples：样本导入要求非空对象数组，剥离样本外层未知字段。
- Writeback：保持既有安全边界，`POST /writeback` 只把 `jobId/confirmed/idempotencyKey/actor` 交给执行服务，客户端 `fields/payload` 被丢弃。
- Production smoke：blocked 输出新增 `SUMMARY_JSON`，机器可读地区分 configuration、secret resolver、session store、queue broker。
- Readiness gate：最终 blocked reason 明确区分本地 readiness、真实外部集成、医疗最终产品。

未改动/未伪造：

- 未接真实 OCR/LLM/LIMS sandbox。
- 未接真实 KMS/Vault/Secret Manager。
- 未接生产多实例 session invalidation store。
- 未接真实 broker 多实例可靠队列。
- 未把 production smoke blocked 写成 passed 或 failed。

## 3. 业务流程完整性

当前本地/契约层流程：

登录 -> 上传病历文件 -> DTO 校验和白名单入参 -> 创建识别任务 -> demo/mock 或配置编排执行 -> 保存识别结果 -> 查看字段/证据/trace -> 反馈/Evaluation -> 服务端复核 readyFields -> 写回尝试 -> 审计与 readiness 诊断。

相对旧 P1/P2 问题状态：

- P1-1 写回信任客户端 payload：已保持服务端 readyFields 复核，客户端 `fields/payload` 不进入执行服务。
- P1-2 demo API 不执行编排：前序已推进 demo mock orchestrator job/result 闭环。
- P1-3 静态 fallback 掩盖失败：前序已改为 demo mode 门禁。
- P1-4 Evaluation 固定 LIMS schema：前序已推进 schema selection。
- P1-5 production smoke：仍 blocked，缺真实 sandbox 和真实生产依赖。
- P1-6 API unknown 契约漂移：本轮收敛 files、jobs、feedback、evaluation samples 和相关 response contract；schemas/providers/audit 等宽响应仍可后续继续收敛。
- P2 session/queue/secret：本地 contract 与诊断已推进；真实外部实现仍 blocked。

## 4. 用户体验

UI 当前阶段保持 Material + Arco Design：

- `test:styles` 和 `test:mobile` 均通过。
- demo-web build 通过，无 500 kB JS chunk warning。
- 本轮未重写 CSS，也未破坏 Material + Arco Design 方向。

用户侧本轮主要收益在错误可诊断性和契约一致性：

- API 非法请求更早返回 400，不再静默把客户端伪造字段传入 service。
- production smoke blocked 输出既有人类可读行，也有 `SUMMARY_JSON`，便于 CI/交接脚本判断 blocked 原因。
- readiness gate 文案避免把“本地通过”误写为“生产可上线”或“医疗最终产品完成”。

## 5. 技术实现

关键实现文件：

- `apps/api/src/routes/route-dtos.ts`：Zod DTO、结构化 route response object 类型。
- `apps/api/src/routes/files.routes.ts`：文件上传 DTO 校验与白名单透传。
- `apps/api/src/routes/jobs.routes.ts`：识别任务 DTO 校验、providerConfig 白名单、service 输入类型。
- `apps/api/src/routes/feedback.routes.ts`：反馈 DTO 校验、`field`/`fieldKey` 归一化。
- `apps/api/src/routes/evaluation.routes.ts`：evaluation samples DTO 校验。
- `apps/api/src/services/api-services.ts`：route response object/list 边界校验。
- `scripts/production-smoke.ts`：blocked step code、missing keys、provider/adapter metadata、`SUMMARY_JSON`。
- `scripts/deployment-readiness-gate.ts`：分层 finalProduct blocked reason。
- `docs/superpowers/plans/2026-06-09-p1-p2-dto-smoke-closure.md`：本轮 superpowers 流程记录。
- `MEDICAL-P1-P2-DTO-SMOKE-FIX-REPORT.md`：本轮修复报告。

测试覆盖：

- DTO 红灯后实现，定向测试覆盖 files/jobs/feedback/evaluation samples 的非法 body、白名单透传、未知字段剥离。
- writeback route 测试继续覆盖客户端 `fields/payload` 丢弃。
- production smoke 测试覆盖 blocked report 与 `SUMMARY_JSON`。
- readiness gate 测试覆盖最终结论文案分层。

## 6. P0/P1/P2 问题清单

P0：

- 未发现当前 demo-web build、全量测试、style/mobile 守卫的阻断级 P0。

P1 已闭环/本轮推进：

- API route DTO：files/jobs/feedback/evaluation samples 从原始 body 透传收敛到 Zod DTO。
- API response contract：files/jobs/feedback/evaluation response 收敛到对象/对象数组边界。
- Writeback 安全边界：服务端仍不信任客户端写回 fields/payload。
- Production smoke blocked 可诊断：新增机器可读 `SUMMARY_JSON`。
- Readiness gate：本地 readiness 与生产/最终产品分层更明确。

P1 still blocked：

- 真实 OCR/LLM/LIMS sandbox 未配置且未通过 smoke。
- 真实 production smoke 仍 `STATUS blocked`。
- schemas/providers/audit 等宽响应与底层 repository `unknown` 仍可继续分阶段收敛。

P2 已推进：

- demo-web style/mobile/build 守卫继续通过。
- production smoke blocked step 包含 code/missingKeys/provider/adapter/requiredExternal。
- readiness final reason 明确 `本地 readiness`、`真实外部集成`、`医疗最终产品`。

P2 still blocked：

- 真实 KMS/Vault/Secret Manager 未接入，env resolver 不能代表生产密钥库。
- 生产多实例 session invalidation store 未接真实数据库/Redis repository 并通过多实例 smoke。
- 真实 Redis/RabbitMQ/SQS broker 多实例可靠队列 smoke 未通过。
- 真实外部 production smoke 未通过。

残余非阻断：

- `corepack pnpm test` 仍输出 Node `DEP0040 punycode` deprecation warning。
- `apps/api/src/repositories/repositoryDatabase.integration.test.ts` 当前环境按设计 skipped。

## 7. 验收结论

本轮必跑命令结果：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed、14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，无 500 kB JS warning；命令输出入口 `index-GKrOmEWy.js`。 |
| `corepack pnpm test` | 通过，67 passed、1 skipped files；377 passed、1 skipped tests；有既有 `DEP0040 punycode` warning。 |
| `corepack pnpm smoke:production` | exit code 2，`MODE blocked`、`STATUS blocked`；不是 failed，也不是 passed；输出含 `SUMMARY_JSON`。 |

定向验证：

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts` | 先红后绿，最终 49 passed。 |
| `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/writeback.routes.test.ts apps/api/src/services/api-services.test.ts scripts/production-smoke.test.ts scripts/deployment-readiness-gate.test.ts` | 通过，68 passed。 |
| `corepack pnpm typecheck` | 通过。 |

Production smoke blocked 明细：

- `configuration`: 缺 `PRODUCTION_SMOKE_BASE_URL`、`PRODUCTION_SMOKE_EMAIL`、`PRODUCTION_SMOKE_PASSWORD`。
- `secret-resolver`: `SECRET_RESOLVER_ENV_ONLY`，真实 KMS/Vault/Secret Manager 未验证。
- `session-invalidation-store`: `SESSION_INVALIDATION_STORE_IN_MEMORY`，生产多实例 session invalidation store 未验证。
- `queue-broker`: `QUEUE_BROKER_NOT_CONFIGURED`，真实 broker 多实例 lease/retry/dead-letter/heartbeat/status consistency smoke 未验证。

最终分层结论：

- UI 当前阶段：通过。
- P1/P2 本轮可落地项：通过。
- 真实外部集成：blocked。
- 医疗最终产品：blocked。
