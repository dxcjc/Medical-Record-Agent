# Phase 3 任务说明 — 数据与展示

## 项目位置
`/tmp/Medical-Record-Agent`

## 背景
Phase 1（体验基础设施）和 Phase 2（功能闭环）已完成。现在系统"能用"了，但数据展示层面还有缺陷：任务列表没有分页搜索、列表列数据缺失、Dashboard 缺趋势图、审计日志无法筛选导出。

## 核心目标
让数据"看得懂、找得到、用得上"。

---

## 任务 1：任务列表分页 + 搜索

### 改动文件
- `apps/api/src/routes/jobs.routes.ts` — 增强列表 API 支持分页参数
- `apps/api/src/services/job.service.ts` — 分页查询逻辑
- `medical-ui/src/pages/JobsPage.tsx` — 分页组件 + 搜索 + 筛选

### 后端需求

1. **GET /jobs** — 增加分页参数
   - 查询参数：`page`（默认1）、`pageSize`（默认20）、`status`（可选）、`schemaKey`（可选）、`search`（可选，搜索任务ID或Schema名）
   - 返回：`{ items: Job[], total: number, page: number, pageSize: number }`
   - 保持向后兼容：如果不传分页参数，返回全部（limit=200 行为不变）

### 前端需求

1. **分页组件**：
   - 底部分页器：上一页/下一页 + 页码 + 每页条数选择（10/20/50）
   - 显示"共 X 条记录"

2. **搜索框**：
   - 表格上方搜索框，placeholder="搜索任务ID或Schema..."
   - 输入后 300ms 防抖触发搜索

3. **状态筛选**：
   - 搜索框旁边下拉筛选：全部 / 排队中 / 运行中 / 已完成 / 失败
   - 选中后即时刷新列表

---

## 任务 2：任务列表列数据补全

### 改动文件
- `apps/api/src/services/job.service.ts` — 列表查询 JOIN 文件信息、计算统计数据
- `apps/api/src/routes/jobs.routes.ts` — 返回值增加字段
- `medical-ui/src/pages/JobsPage.tsx` — 显示真实数据

### 后端需求

1. **列表 API 返回值增强**：
   - `fileName`：关联 StoredFile.originalName（如果有关联文件）
   - `confidence`：整体平均置信度（从 RecognitionResult 计算）
   - `needsReviewCount`：需复核字段数（置信度 < 0.8 或 status=needs_review 的字段数）
   - `provider`：使用的 Provider 名称（任务创建时记录）

2. **如果某些字段短期无法实现**：
   - 在前端隐藏该列，不要显示 `-`

### 前端需求

1. 如果列有数据，正常显示
2. 如果列无数据（后端未返回），隐藏该列，不要显示占位符 `-`
3. 置信度显示为百分比（如 92.5%），带颜色（绿>90%、黄>70%、红<70%）
4. 需复核数显示为数字，>0 时带红色 Badge

---

## 任务 3：Dashboard 趋势图

### 改动文件
- `apps/api/src/services/stats.service.ts` — 增加趋势数据 API
- `apps/api/src/routes/stats.routes.ts` — 新增 /stats/trend 路由
- `medical-ui/src/pages/DashboardPage.tsx` — 趋势图 + 快捷操作

### 后端需求

1. **GET /stats/trend** — 最近 7 天趋势数据
   - 返回：`{ dates: string[], completed: number[], failed: number[], total: number[] }`
   - 按日期聚合，每天统计 completed/failed/total 数量

### 前端需求

1. **趋势图**：
   - 使用简单的 SVG 或 CSS 实现折线图（不引入新依赖）
   - 显示最近 7 天的任务量趋势
   - X 轴：日期，Y 轴：任务数
   - 两条线：已完成（绿色）、失败（红色）
   - 图表容器宽度 100%，高度 200px

2. **快捷操作**：
   - Dashboard 底部增加快捷操作区域
   - 三个卡片：「新建识别」「查看待复核」「查看最新反馈」
   - 点击跳转到对应页面

---

## 任务 4：审计日志筛选导出

### 改动文件
- `apps/api/src/routes/audit.routes.ts` — 增加筛选参数 + 导出 API
- `apps/api/src/services/audit.service.ts` — 筛选查询 + CSV 导出
- `medical-ui/src/pages/AuditPage.tsx` — 筛选 UI + 导出按钮

### 后端需求

1. **GET /audit** — 增加筛选参数
   - `startDate`、`endDate`（时间范围）
   - `action`（操作类型：create/update/delete/review 等）
   - `userId`（操作人）
   - 分页参数：page、pageSize

2. **GET /audit/export** — 导出 CSV
   - 接受同样的筛选参数
   - 返回 CSV 格式：时间、操作人、操作类型、目标对象、详情
   - Content-Type: text/csv
   - Content-Disposition: attachment; filename=audit-YYYY-MM-DD.csv

### 前端需求

1. **筛选区域**：
   - 日期范围选择器（开始-结束）
   - 操作类型下拉：全部/创建/更新/删除/审核
   - 操作人下拉（如果有多个用户）
   - 「重置」按钮

2. **导出按钮**：
   - 筛选区域右侧「导出 CSV」按钮
   - 点击后下载 CSV 文件（带当前筛选条件）

---

## 任务 5：字段统计 API 修复

### 改动文件
- `apps/api/src/services/stats.service.ts` — 确保 /stats/fields 返回正确数据

### 需求

1. **GET /stats/fields** — 字段识别统计
   - 返回每个字段的识别次数、平均置信度、需复核次数
   - 按 schemaKey 分组
   - 确保 API 能正常返回数据（Phase 1 已修复路由前缀）

2. **如果数据为空**：
   - 返回空数组 `[]`，不要 404 或 500

---

## 任务 6：构建验证 + 部署

### 步骤

1. 前端构建：
   ```bash
   cd /tmp/Medical-Record-Agent/medical-ui && npx vite build
   ```

2. 重启 API：
   ```bash
   cd /tmp/Medical-Record-Agent && bash start-api.sh
   ```

3. 重载 nginx：
   ```bash
   sudo systemctl reload nginx
   ```

4. 运行后端测试：
   ```bash
   cd /tmp/Medical-Record-Agent && npx vitest run
   ```

---

## 验收标准

完成所有任务后，生成审计报告到 `/tmp/Medical-Record-Agent/PHASE3-AUDIT.md`，包含：

1. **功能完整性** — 每个任务的完成状态
2. **构建验证** — 前端 build 是否通过
3. **测试验证** — 后端测试通过数
4. **API 验证** — 趋势图/字段统计/审计导出 API curl 测试
5. **UI 验证** — 分页/搜索/筛选功能描述
6. **代码质量** — 无硬编码、无 console.error 残留
7. **Git 提交** — commit hash 和 message

最后用 `git add -A && git commit -m "Phase 3: 数据与展示 - 分页搜索/列数据补全/趋势图/审计导出" && git push` 提交。
