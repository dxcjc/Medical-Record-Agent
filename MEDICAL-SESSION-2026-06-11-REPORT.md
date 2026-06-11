# 医疗项目推进汇报 — 2026-06-11 17:25

## 本轮完成事项

### 1. 移除 Demo 服务，全面切换 Production 模式
- 删除 `apps/api/src/demo-services.ts`（915 行）和 `apps/api/src/demo-services.test.ts`（140 行）
- 简化 `index.ts`，始终使用 `createProductionApiServices`，不再回退到 demo
- 服务器运行在 production mode，OCR 使用 http provider，LLM 使用 openai-compatible provider
- **提交**：`88cc12c`

### 2. 验证引擎 Schema 驱动化（P2-1 闭环）
- 修改 `packages/core/src/engine/validationEngine.ts` 第 32 行
- 移除硬编码 `clinicalDiagnosis` 回退，改为返回所有 schema 字段 key
- 在 `limsClinicalInfoSchema.ts` 中标记 `clinicalDiagnosis` 为 `required: true`
- 新增 `packages/core/test/validationEngine.test.ts`（4 个测试用例）
- **提交**：`b1a4140`

### 3. 验证结果

| 验证项 | 结果 |
|--------|------|
| `corepack pnpm test` | ✅ 77 文件通过，453 测试通过，1 跳过 |
| `corepack pnpm --filter demo-web test:styles` | ✅ 19 测试通过 |
| `corepack pnpm --filter demo-web test:mobile` | ✅ 5 通过，14 跳过 |
| `corepack pnpm --filter demo-web build` | ✅ 构建通过，无 500kB 警告 |
| 9901 `/api/health` | ✅ 200 OK |
| `PRODUCTION_SMOKE_MODE=mock-production` | ✅ 全流程通过 |
| 数据库集成测试（TEST_DATABASE_URL） | ✅ 通过（需设置环境变量） |

## 当前状态分层

| 层级 | 状态 | 说明 |
|------|------|------|
| UI 当前阶段 | ✅ 通过 | Material + Arco Design，样式/移动端测试通过 |
| P1 本地闭环 | ✅ 通过 | Schema 发布确认、API 形状集中化、写回可信边界、文件处理取消 |
| P2 本地闭环 | ✅ 部分通过 | 验证引擎已 schema 驱动化，mock-production smoke 通过 |
| 真实外部集成 | ❌ Blocked | 需真实 OCR/LLM/LIMS sandbox |
| 真实 KMS/Vault | ❌ Blocked | 需部署方提供密钥库 |
| 多实例 Session Store | ❌ Blocked | 需数据库/Redis + 双实例 smoke |
| 可靠队列 | ❌ Blocked | 需 Redis/RabbitMQ/SQS + 多 worker smoke |
| 医疗最终产品 | ❌ Blocked | 以上所有外部依赖完成前不可写通过 |

## 剩余本地可推进项

1. **数据库集成测试自动化**：当前需手动设置 `TEST_DATABASE_URL`，可加入 CI 环境变量
2. **API 速率限制**：添加基本的内存速率限制中间件
3. **Prisma Schema 完善**：检查是否有遗漏的业务实体或字段
4. **浏览器 E2E 验证**：验证现有 E2E 脚本在当前环境可运行

## 需要部署方提供的外部依赖

按优先级排序：
1. 真实 OCR/LLM sandbox（PaddleOCR + LLM endpoint）
2. KMS/Vault/Secret Manager 接入
3. 数据库/Redis session invalidation store
4. Redis/RabbitMQ/SQS 队列 broker
5. 生产多实例部署环境
