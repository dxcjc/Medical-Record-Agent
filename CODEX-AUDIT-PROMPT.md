你是医疗系统的质量审计工程师。对 /tmp/Medical-Record-Agent 项目进行全面审计。

## 审计范围

### 1. 集成测试验证
运行 `npx vitest run apps/api/src/integration/api-e2e.integration.test.ts --reporter=verbose`，记录所有失败的测试用例，分析根因。

### 2. 单元测试验证
运行 `npx vitest run --reporter=verbose`（排除 integration），确认全部通过。

### 3. API 端点实际调用测试
用 curl 测试以下端点（API 在 localhost:3000）：
- POST /api/auth/login（正确密码 admin.dev@example.local / admin123）
- GET /api/providers
- PUT /api/providers/:key（toggle enabled）
- GET /api/schemas
- POST /api/files（上传文件元数据）
- POST /api/jobs（创建任务）
- GET /api/jobs/:id
- GET /api/feedback/all
- GET /api/audit

### 4. 上传→创建任务完整链路
测试 POST /api/files 上传 → 拿到 fileId → POST /api/jobs { sourceFileId } 创建任务的完整流程。

### 5. 数据库一致性
- ProviderConfig 表是否干净（无垃圾数据）
- 所有外键关系是否正确

### 6. 前端构建
cd /tmp/Medical-Record-Agent/medical-ui && npm run build

### 7. 代码质量扫描
- grep -rn "TODO\|FIXME\|HACK" --include="*.ts" | grep -v node_modules | grep -v test
- grep -rn "console\.log" --include="*.ts" | grep -v node_modules | grep -v test
- 检查 crypto.subtle 等浏览器兼容性问题

## 输出要求
将完整审计报告写入 /tmp/Medical-Record-Agent/CODEX-AUDIT-REPORT.md，包含：
1. 每个测试项的通过/失败状态
2. 失败项的根因分析
3. 修复建议
4. 总体评分（0-100）

【重要】不要问问题，不要启动浏览器，不要询问确认。直接开始工作。
