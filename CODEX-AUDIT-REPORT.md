# Medical-Record-Agent 质量审计报告

**审计日期**: 2026-06-14  
**审计范围**: 集成测试、单元测试、API 端点、数据库一致性、前端构建、代码质量  
**审计人**: Codex AI 审计工程师

---

## 总体评分: 72/100

| 维度 | 得分 | 说明 |
|------|------|------|
| 集成测试 | 55 | 9/78 失败，含 1 个 500 错误 |
| 单元测试 | 100 | 367 passed, 1 skipped |
| API 端点 | 70 | 大部分端点正常，部分路由命名不一致 |
| 数据库一致性 | 60 | 33 条测试垃圾数据未清理 |
| 前端构建 | 90 | 构建成功，chunk 偏大 |
| 代码质量 | 75 | 少量 `any` 类型，`console.log` 集中在脚本层 |

---

## 1. 集成测试验证

**命令**: `npx vitest run apps/api/src/integration/api-e2e.integration.test.ts --reporter=verbose`  
**结果**: 9 failed, 69 passed

### 失败用例及根因分析

#### FAIL-1: DELETE /providers/:key — delete provider (500)
- **状态码**: 期望 200，实际 500
- **根因**: `deleteProvider` 在 `production-services.ts` 中将已删除（status=disabled）的 provider 再次删除时，`providerRepository.save()` 内部抛出未捕获异常。测试数据中的 `test-delete-*` provider 已被前序测试置为 `disabled`，再次 DELETE 触发 Prisma 或业务层未处理的错误。
- **严重性**: 高 — 500 错误不应暴露给客户端

#### FAIL-2: POST /jobs — create job with sourceFileId (404)
- **状态码**: 期望 ≤201，实际 404
- **根因**: `STORED_FILE_NOT_FOUND` — 通过 POST /files 创建的元数据记录没有对应的存储层实际文件内容。`createStoredFileDocumentInput` 会尝试从 `storageProvider.get(storageKey)` 读取文件内容，但元数据上传不包含实际文件字节。
- **严重性**: 中 — 测试数据准备不充分，但反映了真实上传流程的断层

#### FAIL-3: GET /knowledge — list knowledge entries
- **响应体**: 期望 `res.body.items` 是 Array，实际 `res.body` 返回 `{ entries, total }`
- **根因**: `knowledge.routes.ts` 返回 `{ entries, total }`，但测试期望 `{ items, total }`。路由层与测试契约不匹配。
- **严重性**: 低 — 仅测试断言与路由响应结构不一致

#### FAIL-4: GET /knowledge — with kind filter
- **根因**: 同 FAIL-3，`entries` vs `items` 字段名不匹配
- **严重性**: 低

#### FAIL-5: GET /stats/trends — returns trend data (404)
- **状态码**: 期望 200，实际 404
- **根因**: 路由注册为 `/stats/trend`（单数），测试请求 `/stats/trends`（复数）。`stats.routes.ts:63` 注册 `"/stats/trend"`。
- **严重性**: 中 — 路由命名不一致

#### FAIL-6: POST /writeback — missing confirmed → 400
- **状态码**: 期望 400，实际 409
- **根因**: `writeback.routes.ts:103` 在 Zod schema 校验失败后，先检查 `confirmed !== true` 并返回 409 `WRITEBACK_REQUIRES_CONFIRMED_JOB`，而不是直接返回 400。路由层逻辑顺序问题。
- **严重性**: 低 — 行为合理但不符合 REST 语义（400 = Bad Request）

#### FAIL-7: Security Headers — referrer-policy
- **实际值**: `strict-origin-when-cross-origin`，期望 `no-referrer`
- **根因**: `server.ts` 中有两处 `onRequest` hook：`createSecurityHeaders()` 设置 `no-referrer`，`registerSecurityHeaders()` 设置 `strict-origin-when-cross-origin`。后者注册在后，覆盖前者。两个安全头配置冲突。
- **严重性**: 中 — 安全头配置冲突，实际值偏宽松

#### FAIL-8: Full Workflow: Upload → Job → Result
- **根因**: 同 FAIL-2，文件上传无实际存储内容，job 创建失败
- **严重性**: 中

#### FAIL-9: Secret refs masking check
- **根因**: 测试在 provider 列表迭代中检查 `secretRefs` 值是否被脱敏，但某些 provider 的 `secretRefs` 为 `{}`，迭代时 `Object.entries()` 为空，不会执行断言。测试逻辑有缺陷但不会实际失败。
- **严重性**: 低

---

## 2. 单元测试验证

**命令**: `npx vitest run --exclude='**/integration/**' --reporter=verbose`  
**结果**: ✅ 367 passed, 1 skipped (58 test files)

所有单元测试通过。`punycode` 模块废弃警告在测试输出中出现多次，不影响功能。

---

## 3. API 端点实际调用测试

| 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `/auth/login` | POST | ✅ 200 | 正确返回 JWT + 用户信息 |
| `/providers` | GET | ✅ 200 | 返回 provider 列表 |
| `/providers/:key` | PUT | ⚠️ 403 | `ENV_PROVIDER_NOT_EDITABLE` — 环境变量配置的 provider 不可编辑 |
| `/schemas` | GET | ✅ 200 | 返回 schema 列表 |
| `/files` | POST | ✅ 200 | 返回文件元数据记录 |
| `/jobs` | POST | ❌ 404 | `STORED_FILE_NOT_FOUND` — 需要实际文件内容 |
| `/feedback/all` | GET | ✅ 200 | 返回 feedback 列表 |
| `/audit` | GET | ✅ 200 | 返回审计日志 |
| `/knowledge` | GET | ✅ 200 | 返回 `{ entries, total }` |
| `/stats/trend` | GET | ✅ 200 | 路由为单数 `trend` |
| `/stats/trends` | GET | ❌ 404 | 路由不存在（应为 `trend`） |

---

## 4. 上传→创建任务完整链路

**流程**: POST /files (元数据) → POST /jobs { sourceFileId }

- POST /files 成功创建元数据记录（返回 fileId）
- POST /jobs 返回 404 `STORED_FILE_NOT_FOUND`
- **根因**: 元数据上传不包含实际文件字节。`createStoredFileDocumentInput` 尝试从 storage provider 读取文件内容，但 local storage 中没有对应文件。
- **修复建议**: 测试需要先通过 storage provider 写入实际文件内容，或使用 multipart 上传端点（如果存在）。当前 API 设计为两步流程：先创建元数据，再通过其他方式上传内容。

---

## 5. 数据库一致性

### ProviderConfig 表 — 严重污染

```sql
SELECT count(*) FROM "ProviderConfig" WHERE key LIKE 'test-%';
-- 结果: 33 条测试垃圾数据
```

| 问题 | 数量 | 说明 |
|------|------|------|
| `test-*` 前缀的 provider | 33 | 集成测试遗留，未清理 |
| 其中 `test-default-*` 被设为 `isDefault=true` | 1 | `test-default-1781451249813` 被标记为 OCR 默认 provider |
| `test-*` 仍为 `active` 状态 | 13 | 未被正确清理 |

**关键风险**: `test-default-1781451249813` 是 OCR 类型的默认 provider，意味着实际 OCR 请求可能路由到不存在的测试端点。

### 外键关系

| 检查项 | 结果 |
|--------|------|
| RecognitionJob → StoredFile | ✅ 无孤儿记录 |
| RecognitionResult → RecognitionJob | ✅ 无孤儿记录 |
| FeedbackSubmission → RecognitionJob | ✅ 无孤儿记录 |

### 其他表

| 表 | 记录数 | 说明 |
|----|--------|------|
| User | 3 | 正常 |
| RecognitionJob | 77 | 含测试数据 |
| StoredFile | 166 | 含测试数据 |
| RecognitionResult | 76 | 含测试数据 |
| KnowledgeEntry | 33 | 正常 |
| WebhookSubscription | 0 | 空表 |

---

## 6. 前端构建

**命令**: `cd medical-ui && npm run build`  
**结果**: ✅ 构建成功

| 文件 | 大小 | gzip |
|------|------|------|
| `index.html` | 0.95 kB | 0.48 kB |
| `index-HbBIjWwM.js` | 386.78 kB | 112.96 kB |
| `vendor-arco-B3TDCr9h.js` | 716.67 kB | 199.65 kB |
| `vendor-react-BBsK_5WM.js` | 49.33 kB | 17.37 kB |
| `vendor-query-CjXceIly.js` | 42.05 kB | 12.70 kB |
| `index-DC8oooMl.css` | 583.45 kB | 66.61 kB |

**警告**: Arco Design vendor chunk 超过 700 kB，建议使用动态导入进行代码分割。

---

## 7. 代码质量扫描

### TODO/FIXME/HACK
- **结果**: 0 处 — 代码库干净

### console.log
- **结果**: 集中在 `scripts/` 目录的 CLI 工具和 `prisma/seed-*.ts` 中，属于合理的日志输出。生产代码中无 `console.log`。

### crypto.subtle 浏览器兼容性
- `medical-ui/src/api/client.ts:280` — 使用 `crypto.subtle.digest('SHA-256', ...)` 计算文件 checksum
- 有 fallback 处理：`crypto.subtle` 不可用时跳过 checksum
- 注释说明只在 secure context (HTTPS/localhost) 下可用
- **风险**: 低 — 有适当的 fallback

### any 类型使用
- `knowledge.routes.ts` — 多处使用 `any` 类型（list/filter/create/update 参数、error catch）
- `stats.routes.ts` — `authenticate: any`
- **风险**: 中 — 建议为 knowledge route service 定义具体接口类型

### @ts-ignore / @ts-expect-error
- 仅出现在 `route-service-contracts.test.ts` 中，用于测试目的，合理

### 安全头配置冲突
- `server.ts:createSecurityHeaders()` 设置 `referrer-policy: no-referrer`
- `security.middleware.ts:registerSecurityHeaders()` 设置 `Referrer-Policy: strict-origin-when-cross-origin`
- 两个 `onRequest` hook 互相覆盖，最终生效的是 `strict-origin-when-cross-origin`
- **风险**: 中 — 配置冲突可能导致安全策略不一致

---

## 8. 关键问题汇总

### 严重 (需立即修复)
1. **ProviderConfig 表污染**: 33 条测试垃圾数据，其中 `test-default-1781451249813` 被设为 OCR 默认 provider，影响生产 OCR 路由
2. **DELETE /providers/:key 返回 500**: 删除已删除的 provider 触发未捕获异常

### 中等
3. **路由命名不一致**: `/stats/trend` vs `/stats/trends`
4. **安全头配置冲突**: `no-referrer` 被 `strict-origin-when-cross-origin` 覆盖
5. **Knowledge 路由响应结构**: 返回 `entries` 而非 `items`，与项目其他列表 API 不一致
6. **Writeback 错误码**: 缺少 `confirmed` 字段返回 409 而非 400

### 低
7. **测试数据未清理**: 166 个 StoredFile、77 个 RecognitionJob 等测试遗留数据
8. **Arco Design chunk 过大**: 716 kB vendor chunk 建议代码分割
9. **`any` 类型**: knowledge.routes.ts 多处使用 `any`

---

## 9. 修复建议

### 优先级 P0 — 数据清理
```bash
# 清理测试 provider 数据
DELETE FROM "ProviderConfig" WHERE key LIKE 'test-%';
# 确保 paddleocr-http 恢复为 OCR 默认 provider
UPDATE "ProviderConfig" SET "isDefault" = true WHERE key = 'paddleocr-http';
```

### 优先级 P1 — 代码修复
1. **DELETE provider 500**: 在 `production-services.ts` 的 `deleteProvider` 中处理已删除 provider 的情况，返回 404 而非 500
2. **路由命名**: 统一 `/stats/trend` 为 `/stats/trends`（或更新测试）
3. **安全头**: 移除 `createSecurityHeaders()` 中的 `referrer-policy`，统一由 `registerSecurityHeaders` 管理
4. **Knowledge 响应**: 将 `{ entries, total }` 改为 `{ items, total }` 以保持一致性

### 优先级 P2 — 测试改进
1. 集成测试应在 `afterAll` 中清理测试数据
2. 文件上传测试应模拟实际存储内容
3. 更新测试断言匹配实际路由响应结构

---

## 10. 审计结论

项目整体质量良好，单元测试覆盖率高（367 通过），前端构建成功，代码库无 TODO/FIXME 遗留。主要问题集中在：

1. **测试数据污染数据库** — 集成测试遗留 33 条 provider 记录和大量其他测试数据
2. **路由/响应一致性** — 少数端点命名和响应结构与测试契约不匹配
3. **安全头配置冲突** — 两处安全头设置互相覆盖

建议优先清理数据库测试数据并修复 DELETE provider 500 错误，然后统一路由命名和安全头配置。
