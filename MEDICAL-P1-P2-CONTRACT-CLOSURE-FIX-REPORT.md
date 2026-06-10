# Medical P1/P2 Contract Closure Fix Report

生成时间：2026-06-09 CST / Asia/Shanghai

## 修复范围

本轮继续推进当前环境可落地、且不依赖真实外部凭据的 P1/P2 contract closure。范围限定在 API route DTO 和安全边界：

- Provider 保存 DTO：拒绝在 `config` 中提交疑似明文密钥字段，例如 `apiKey`、`token`、`password`、`secret`、`clientSecret`、`Authorization`。
- Provider `secretRefs`：从宽 `Record<string, unknown>` 收窄为 `Record<string, non-empty string>`，真实密钥仍只能通过引用名间接解析。
- Audit 查询 DTO：`take` 只接受正整数并限制上限 100；`take=12abc`、小数、负数等非法分页参数直接返回 400，不再静默忽略或截断。
- 保持 provider 响应中的 `secretRefs` 脱敏输出，不返回明文 secret。

本轮未改 UI CSS，未接真实 OCR/LLM/LIMS/KMS/broker，未提交 git commit，未修改 `.env`、`node_modules` 或缓存目录。

## 修改文件

- `apps/api/src/routes/route-dtos.ts`
  - 新增 provider `config` 递归敏感键检查。
  - 新增 `secretRefs` 非空字符串引用 schema。
  - 收紧 audit `take` 解析为完整正整数。

- `apps/api/src/routes/providers.routes.test.ts`
  - 增加 provider 保存时拒绝 `config.apiKey` 和 `config.headers.Authorization` 的测试。
  - 增加拒绝对象型/空字符串 `secretRefs` 的测试。

- `apps/api/src/routes/audit.routes.test.ts`
  - 增加未知 query 字段剥离测试。
  - 增加非法 `take=12abc` 返回 400 且不调用 service 的测试。

- `docs/superpowers/plans/2026-06-09-p1-p2-contract-closure.md`
  - 记录 brainstorming、writing plan、TDD 红绿过程和 verification-before-completion 结果。

## TDD 过程

- 红灯：`corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts`
  - Provider 明文密钥请求未在 DTO 层截断。
  - Audit 非法 `take` 被当作 200。
- 绿灯：实现 DTO 收紧后，同一命令通过，18 tests passed。
- 追加红灯：把 audit 非法值改为 `take=12abc` 后确认旧 `parseInt` 语义会错误通过。
- 绿灯：改为完整正整数解析后，audit/providers 定向测试通过。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm vitest run apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/providers.routes.test.ts` | 通过，18 tests passed。 |
| `corepack pnpm vitest run apps/api/src/routes/providers.routes.test.ts apps/api/src/routes/audit.routes.test.ts apps/api/src/routes/schemas.routes.test.ts apps/api/src/services/api-services.test.ts apps/api/src/demo-services.test.ts apps/demo-web/src/pages/operations/ProviderSettingsPage.test.ts apps/demo-web/src/api/client.test.ts` | 通过，69 tests passed。 |
| `corepack pnpm typecheck` | 通过。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:styles` | 通过，19 tests passed。 |
| `corepack pnpm --filter @medical-record-agent/demo-web test:mobile` | 通过，5 passed、14 skipped。 |
| `corepack pnpm --filter @medical-record-agent/demo-web build` | 通过，无 500 kB JS warning；`vendor-arco` JS chunk 415.91 kB。 |
| `corepack pnpm test` | 通过，68 passed、1 skipped files；398 passed、1 skipped tests；仍有既有 Node `DEP0040 punycode` warning。 |
| `corepack pnpm smoke:production` | exit code 2，`STATUS blocked`；不是 passed。 |

## 9901 检查

- `http://localhost:9901/`：200 OK。
- `http://localhost:9901/api/health`：200 OK，返回 `{"status":"ok","service":"medical-record-agent-api"}`。
- 9901 HTML 引用当前 dist bundle `/assets/index-DQ-Z7-_K.js`。

## 剩余 Blocked

- 真实 OCR/LLM/LIMS sandbox：blocked，缺真实 sandbox base URL、账号和 provider/LIMS 凭据。
- 真实 KMS/Vault/Secret Manager：blocked，当前 `SECRET_RESOLVER_ENV_ONLY` 不能代表生产密钥库。
- 生产多实例 session invalidation store：blocked，当前为 in-memory posture，需数据库/Redis repository 与双实例 smoke。
- 真实 broker 多实例可靠队列：blocked，缺 Redis/RabbitMQ/SQS 真实 broker 与 lease/retry/dead-letter/heartbeat/status consistency smoke。
- 医疗最终产品：blocked。本轮仅完成本地 provider/audit contract closure，不能声明最终医疗产品完成。
