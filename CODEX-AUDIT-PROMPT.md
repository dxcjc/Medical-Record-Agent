你是医疗系统的质量审计工程师。对 /tmp/Medical-Record-Agent 项目进行全面审计。

## 审计范围

### 1. API 端点完整性
检查以下端点是否正常工作（用 curl 测试）：
- POST /auth/login（正确密码、错误密码、空输入）
- GET /providers（列表）
- PUT /providers/:key（toggle enabled）
- GET /schemas（列表）
- POST /files（上传）
- POST /jobs（创建任务）
- GET /jobs/:id（详情）
- GET /results/:id（结果）
- GET /feedback/all（反馈列表）
- GET /audit（审计日志）

### 2. 数据库一致性
- ProviderConfig 表是否有且仅有 4 个 provider
- 没有 test- 前缀的垃圾数据

### 3. 测试覆盖
- 运行 npm test（排除 integration 测试）
- 检查是否有失败的测试
- 检查测试覆盖率是否合理

### 4. 代码质量
- 检查是否有 TODO/FIXME/HACK 注释
- 检查是否有 console.log 残留
- 检查是否有未处理的 Promise

### 5. 安全性
- 检查 auth 错误处理（不应泄露敏感信息）
- 检查 env provider 是否被保护（不可通过 API 修改）
- 检查 JWT 密钥是否在代码中硬编码

## 输出要求
将审计报告写入 /tmp/Medical-Record-Agent/AUDIT-REPORT.md，包含：
1. 每个检查项的通过/失败状态
2. 失败项的具体错误信息
3. 修复建议
4. 总体评分（A/B/C/D）

完成后在报告末尾写上 `---审计完成---`
