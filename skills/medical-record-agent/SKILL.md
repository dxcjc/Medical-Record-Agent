---
name: medical-record-agent
description: "医疗病历识别 Agent：上传病历图片→OCR→LLM结构化抽取→验证→回写。当用户需要识别病历、查看识别结果、纠正字段、管理知识库时使用。"
cli_version: ">=0.1.0"
---

# Medical Record Agent Skill

通过 `mra` 命令行工具调用医疗病历识别能力。

## 严格禁止 (NEVER DO)
- 不要使用 mra 命令以外的方式调用识别 API（禁止手动 curl）
- 不要编造 job_id、file_id 等标识符，必须从命令返回中提取
- 不要猜测字段名，先用 `mra result <job_id> --format json` 查看实际字段

## 严格要求 (MUST DO)
- 所有命令加 `--format json` 获取可解析输出（需要结构化数据时）
- 纠正字段前必须先用 `mra result` 查看当前值
- 识别完成后必须检查置信度，<80% 的字段需要人工审核

## 核心流程

### 意图判断决策树

| 用户说... | 应该用 | 不要用 |
|-----------|--------|--------|
| "识别这张病历/图片/报告" | `mra recognize` | — |
| "识别结果是什么" | `mra result` | — |
| "任务进度怎么样了" | `mra status` | — |
| "XX字段不对，应该是YY" | `mra feedback` | — |
| "有哪些识别 schema" | `mra schemas` | — |
| "搜索知识库" | `mra knowledge search` | — |
| "查看最近的任务" | `mra jobs` | — |
| "这个命令怎么用" | `mra schema <cmd>` | — |

### 完整识别流程

```
Step 1: mra recognize --file /path/to/scan.jpg --format json
        → 返回 job_id

Step 2: mra status <job_id>
        → 等待 status 变为 completed（通常 30-60 秒）

Step 3: mra result <job_id> --format json
        → 返回所有字段值、置信度、证据

Step 4: 如果有字段需要纠正
        mra feedback <job_id> --field <key> --value <correct_value>
```

### 纠正流程

```
Step 1: mra result <job_id> --format json
        → 查看当前所有字段值

Step 2: mra feedback <job_id> --field patientName --value "张三"
        → 纠正单个字段

Step 3: 重复 Step 2 纠正其他字段
```

## 命令参考

### recognize — 识别病历

```bash
mra recognize --file <path> [--schema <key>] [--format json]
```

- `--file` (必需): 病历图片路径
- `--schema` (可选): 识别 schema，默认 `tumor-gene-test`

输出示例:
```json
{
  "job_id": "cmqxxx",
  "status": "queued",
  "schema": "tumor-gene-test",
  "created": "2026-06-13T12:00:00Z"
}
```

### status — 查询状态

```bash
mra status <job_id> [--format json]
```

状态值: `queued` → `running` → `completed` / `failed`

### result — 获取结果

```bash
mra result <job_id> [--format json|table]
```

JSON 输出包含:
- `fields`: 所有识别字段（key → {value, confidence, needsReview, evidence}）
- `confidence`: 总置信度
- `reviewRequired`: 是否需要人工审核

### feedback — 纠正字段

```bash
mra feedback <job_id> --field <key> --value <value>
```

### knowledge — 知识库

```bash
mra knowledge search <query>     # 搜索
mra knowledge list [--kind <type>]  # 列表
```

kind 类型: `cancer_alias`, `medical_term`, `lims_dictionary`, `field_description`

### schemas — 列出 schema

```bash
mra schemas [--format json]
```

### schema — 查看命令参数

```bash
mra schema                # 列出所有命令
mra schema recognize      # 查看 recognize 的参数详情
```

### jobs — 列出任务

```bash
mra jobs [--status <status>] [--limit <n>] [--format json]
```

## 全局选项

| 选项 | 短名 | 说明 | 默认 |
|------|:---:|------|------|
| `--format` | `-f` | 输出格式: json / table | table |
| `--api-url` | | API 地址 | http://localhost:3000 |
| `--verbose` | `-v` | 详细日志 | false |
| `--help` | `-h` | 显示帮助 | — |

## 环境变量

| 变量 | 说明 |
|------|------|
| `MRA_API_URL` | API 地址（默认 http://localhost:3000）|
| `MRA_API_TOKEN` | JWT 认证 token（必需，通过 `--token` 或环境变量传入）|

## 认证

所有命令需要 JWT token。获取方式：

```bash
# 方式1：环境变量
export MRA_API_TOKEN="your-jwt-token"
mra jobs

# 方式2：命令行参数
mra jobs --token "your-jwt-token"
```

## 错误处理

1. 遇到错误，加 `--verbose` 重试一次
2. 如果 API 不可达，检查服务是否启动: `curl http://localhost:3000/health`
3. 如果识别失败，查看 job 状态: `mra status <job_id> --format json`
4. 认证失败时，检查 API 的 JWT_SECRET 配置

## 安装

```bash
# 全局链接
cd apps/cli && npm link

# 或直接运行
node apps/cli/index.js recognize --file scan.jpg
```
