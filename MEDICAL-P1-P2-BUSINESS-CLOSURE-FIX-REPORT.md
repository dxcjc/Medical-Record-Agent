# 医疗项目 P1/P2 修复报告（2026-06-11）

## 修复内容

### P1-0：ProviderSettingsPage 测试失败 ✅ 已修复

**问题：** `buildProviderKeyForArea("LLM")` 测试期望 `"configured-llm-provider"`，但代码返回 `"gpt5-llm"`。

**修复：**
- `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx`：`providerKeyByArea` 改为使用通用键名（`configured-ocr-provider`、`configured-llm-provider`、`configured-storage-provider`）
- `apps/api/src/demo-services.ts`：添加通用键名别名，demo provider 同时注册原始键和通用键
- `apps/api/src/demo-services.test.ts`：更新测试期望，包含 7 个 provider（4 原始 + 3 通用别名）

**验证：** ProviderSettingsPage 5 个测试全部通过。

### P1-2：Demo API 不执行编排 ✅ 已修复

**问题：** `demo-services.ts` 的 `jobService.create()` 检测到无真实 provider 时抛 `REAL_PROVIDER_NOT_CONFIGURED` 错误，demo 模式无法创建识别任务。

**修复：**
- `apps/api/src/demo-services.ts`：`jobService.create()` 改为调用 `demoRecognitionOrchestrator.start()` 执行 mock 编排，返回完整识别结果（status=completed、extractedFields、evidence）
- `apps/api/src/demo-services.test.ts`：测试从"期望抛错"改为"期望成功创建任务"

**验证：** 测试验证 demo 创建任务返回 status="completed"。

### P1-3：静态 demo 数据兜底 ✅ 已确认安全

**分析：** `JobDetailPage.tsx` 的 `isExplicitDemoMode()` 仅在 `VITE_DEMO_MODE=true` 时返回 true。生产构建中该环境变量未设置，API 失败时显示错误状态而非 demo 数据。

**代码位置：**
- Line 61-63：`isExplicitDemoMode` 检查 `VITE_DEMO_MODE === "true"`
- Line 211：`showDemoData = demoMode && routeJobId === "demo"`
- Line 413：API 失败且非 demo 模式时显示错误提示

**结论：** 生产模式下不会显示 demo 数据，P1-3 已通过现有代码逻辑解决。

### 额外改进（Codex 完成）

1. **Provider 健康检查真实化**：demo 模式下健康检查现在真正调用 OCR/LLM 服务端点，返回实际延迟和状态
2. **Rate limiter 修复**：`Math.ceil` 用于正确的秒数计算
3. **SHA-256 错误处理**：`blobSha256Hex` 捕获错误返回 "unsupported"
4. **Provider 类型扩展**：添加 "LIMS REST" 和 "Object Storage" 类型
5. **Provider 设置页 CSS**：278 行新样式

## 验证结果

| 命令 | 结果 |
|------|------|
| `corepack pnpm test` | ✅ 77 passed, 1 skipped (78); 454 passed, 1 skipped (455) |
| `corepack pnpm build` | ✅ demo-web + api + core + shared 全部通过 |
| `corepack pnpm typecheck` | ✅ 4 个工作区项目全部通过 |
| `curl http://localhost:9901/` | ✅ HTTP 200 |
| `curl http://localhost:9901/api/health` | ✅ `{"status":"ok","service":"medical-record-agent-api"}` |

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| `apps/demo-web/src/pages/operations/ProviderSettingsPage.tsx` | 修改：providerKeyByArea 通用化、类型扩展、健康检查描述修复 |
| `apps/api/src/demo-services.ts` | 修改：jobService.create 走 mock 编排、通用键名别名、健康检查真实化 |
| `apps/api/src/demo-services.test.ts` | 修改：更新 provider 列表期望、demo 创建任务测试 |
| `apps/api/src/server.ts` | 修改：rate limiter Math.ceil |
| `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx` | 修改：SHA-256 错误处理 |
| `apps/demo-web/src/styles.css` | 新增：278 行 Provider 设置页样式 |

## 剩余问题

### P1（应该修复）

| 编号 | 问题 | 状态 |
|------|------|------|
| P1-5 | 生产 smoke 未配置 | ❌ 未修复 |
| P1-6 | API 路由 unknown 契约 | ❌ 未修复 |

### P2（可以优化）

| 编号 | 问题 | 状态 |
|------|------|------|
| P2-1 | 关键字段规则硬编码 clinicalDiagnosis | ❌ 未修复 |
| P2-2 | 任务创建同步执行 | ❌ 未修复 |
| P2-3 | JWT 存 localStorage | ❌ 未修复 |
| P2-4 | Provider secretRefs 未接入密钥库 | ❌ 未修复 |
| P2-5 | 无 E2E 测试 | ❌ 未修复 |

## 审计结论

**当前阶段通过（有条件）。** P0 已清零，P1-0/P1-2/P1-3 已修复，核心测试 454 个全部通过，构建和部署正常。剩余 P1-5/P1-6 和 P2 项为生产上线前需处理的集成和安全问题，不阻塞当前开发阶段。
