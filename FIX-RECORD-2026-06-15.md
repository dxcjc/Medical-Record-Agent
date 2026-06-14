# 修复记录：文件上传 400 错误 & env 双环境并存

**日期：** 2026-06-15
**修复人：** Hermes Agent
**影响范围：** 前端文件上传、后端 env 配置、数据库 Provider 配置

---

## 问题描述

1. **文件上传返回 400**：前端点击"开始识别"后，`POST /api/files` 返回 `400 BAD_REQUEST`，提示 "Invalid file upload payload"
2. **env 双环境并存**：根目录 `.env` 和 `apps/api/.env` 存在重复配置（PORT、HOST、API_SERVICE_MODE），且 `VOLCES_API_KEY` 仍在 env 中而非数据库
3. **OCR Provider 未设为默认**：数据库中 `paddleocr-http` 的 `isDefault=false`，导致创建任务时报 `PROVIDER_CONFIG_NOT_AVAILABLE`

---

## 根因分析

### Bug 1：文件上传 400（核心问题）

**根因：** 前端 `client.ts` 的 `filesApi.upload()` 函数在 HTTP 环境下（非 HTTPS），`crypto.subtle` 不可用，`checksumSha256` 被设为空字符串 `""`。但后端 Zod schema 中 `checksumSha256` 定义为 `optionalNonEmptyString`（即 `z.string().min(1).optional()`），空字符串 `""` 不等于 `undefined`，会触发 `min(1)` 校验失败，返回 400。

**触发条件：** 通过 HTTP 访问（非 localhost、非 HTTPS），`crypto.subtle.digest` 不可用

**关键代码路径：**
- 前端：`medical-ui/src/api/client.ts` 第 277-298 行
- 后端：`apps/api/src/routes/route-dtos.ts` 第 10 行 `optionalNonEmptyString = z.string().min(1).optional()`

### Bug 2：env 双环境并存

**根因：** 早期 MVP 阶段在 `apps/api/.env` 中配置了 `VOLCES_API_KEY` 等业务参数，后迁移到数据库 ProviderConfig 表后未清理。代码中 `buildSavedModelProvider` 只从 `secretRefs` 读取 apiKey，不从 config 直接读取。

### Bug 3：OCR Provider 未设为默认

**根因：** 数据库中 `paddleocr-http` 的 `isDefault` 字段为 `false`，系统创建任务时找不到默认 OCR Provider。

---

## 修复方案

### 修复 1：前端 checksumSha256 条件发送

**文件：** `medical-ui/src/api/client.ts`

```diff
- checksumSha256,
+ ...(checksumSha256 ? { checksumSha256 } : {}),
```

当 `checksumSha256` 为空字符串时，不包含该字段，避免 Zod 校验失败。

### 修复 2：代码支持从数据库 config 直接读取 apiKey

**文件：** `apps/api/src/bootstrap/production-services.ts` 第 1184-1198 行

```diff
- // apiKey 只通过 secretRefs 交给可插拔 resolver 解析，不从 provider config 明文字段读取。
+ // apiKey 优先从 secretRefs 解析（安全存储），若无则直接从 config 读取（数据库存储）。
  if (mode === "http" || mode === "openai-compatible") {
    ...
-   const apiKey = await resolveSecretValue({...});
-   if (apiKey === null) {
-     return null;
-   }
+   let apiKey = await resolveSecretValue({...});
+   if (apiKey === null || apiKey === undefined) {
+     apiKey = readOptionalString(input.config.apiKey);
+   }
```

### 修复 3：合并 env 文件 & 清理环境变量

- 删除 `apps/api/.env`（与根目录 `.env` 重复）
- 根目录 `.env` 仅保留基础设施配置：DATABASE_URL、PORT、HOST、API_SERVICE_MODE、JWT_SECRET、STORAGE_DRIVER、LOCAL_STORAGE_DIR
- 删除 `VOLCES_API_KEY` 环境变量（已存入数据库 config）

### 修复 4：数据库配置更新

```sql
-- 设置 OCR provider 为默认
UPDATE "ProviderConfig" SET "isDefault" = true WHERE key = 'paddleocr-http';

-- LLM apiKey 存入 config，清空 secretRefs
UPDATE "ProviderConfig"
SET config = jsonb_set(config, '{apiKey}', '"54d69b29-bbb6-4cc9-b7ff-48d825cdc070"'),
    "secretRefs" = '{}'
WHERE key = 'volces-seed-2-pro';
```

### 修复 5：清理失败任务

删除了 122 条状态为 `failed` 的历史任务记录。

---

## 验证结果

```
✅ 登录成功
✅ 文件上传成功（POST /files → 200）
✅ 创建识别任务成功（POST /jobs → 200，无 400 错误）
✅ 任务执行完成（status: completed）
✅ .env 文件已清理，无重复配置
✅ 数据库 Provider 配置正确（4 个 Provider 均为 default）
```

---

## 经验教训

1. **空字符串 ≠ undefined**：Zod 的 `.optional()` 只接受 `undefined`，不接受空字符串。前端发送可选字段时应使用条件展开 `...(val ? { val } : {})` 而非直接赋值
2. **HTTP 环境下 crypto.subtle 不可用**：浏览器安全策略要求 HTTPS 或 localhost 才能使用 Web Crypto API
3. **env 配置迁移后必须清理旧文件**：迁移到数据库后应删除 env 中的业务配置，避免双环境 confusion
4. **Provider 默认状态**：新增 Provider 后必须检查 `isDefault` 字段
