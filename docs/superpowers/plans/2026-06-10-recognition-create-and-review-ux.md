# Recognition Create And Review UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化新建识别页和识别详情页，让用户按“能力就绪 -> 上传病历 -> 开始识别 -> 查看结果并复核字段”的路径完成任务。

**Architecture:** 本轮只做前端 UX 和页面状态收敛。新建识别页固定展示本地 PaddleOCR 和内置本地文件保存，不再让用户选择 OCR Provider、Storage Provider、LIMS 或合成样本；详情页改成结果复核工作台，展示任务状态、原件预览、OCR 文本、字段结果、证据和复核操作。后端 PaddleOCR 实际接入、坐标框标注、LIMS 写回、多用户协同和完整审计另开计划。

**Tech Stack:** React + TypeScript + Arco Design + Vite + Vitest，现有页面位于 `apps/demo-web/src/pages/recognition/`，样式集中在 `apps/demo-web/src/styles.css`。

---

## Scope

本计划只实现识别创建与详情复核的用户体验调整。

本轮做：

- 新建识别页只保留本地 OCR、内置文件保存、模型提供商、上传病历、Schema/文档类型、隐私选项和开始识别。
- 新建识别页去掉合成样本按钮、OCR Provider 下拉、Storage/LIMS 暗示和写回选项。
- 详情页标题改为“识别结果复核”，按任务状态、进度、原件预览、OCR 文本、字段复核、技术详情组织。
- 详情页保留原件展示，但不做图片/PDF 坐标框标注。
- 详情页证据联动先高亮 OCR 文本或 OCR block。
- 详情页不做 LIMS 写回，移除“确认写回”主动作。

本轮不做：

- PaddleOCR Python 脚本桥接和后端真实 OCR provider。
- `providerTypes.ts` 去 mock 的后端重构。
- 图片坐标框、高亮框、手动框选。
- LIMS 自动写回。
- 多人复核锁、完整审计日志后台。
- git commit。当前 AGENTS.md 明确没有用户要求时不提交。

---

## File Structure

- Modify: `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`
  - 锁定新建识别页的新行为：只依赖 LLM；本地 PaddleOCR 和内置存储是内置能力；合成样本入口不再存在；提交 payload 使用固定本地 OCR key。

- Modify: `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
  - 删除 OCR Provider 下拉、合成样本按钮和写回隐私选项。
  - 增加能力摘要 helper 和页面能力状态区。
  - 调整提交门禁为“模型提供商可用 + 文件有效”。

- Modify: `apps/demo-web/src/pages/recognition/JobDetailPage.test.ts`
  - 锁定详情页复核工作台数据映射：任务摘要、状态时间线、字段状态排序、证据选择、高亮目标。

- Modify: `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`
  - 重排页面结构：顶部摘要、时间线、原件/OCR、字段复核、技术详情。
  - 移除写回 CTA 和 Payload Preview 的默认暴露。
  - 支持字段选择、当前确认值编辑、无法确认、保存复核的前端状态。

- Modify: `apps/demo-web/src/pages/recognition/components/RecognitionShared.tsx`
  - 只在必要时增加小型复用展示组件，例如 `CapabilityStatusItem` 或 `ReviewStatusPill`。
  - 不做大规模设计系统重构。

- Modify: `apps/demo-web/src/styles.css`
  - 新增识别能力摘要、详情复核布局、OCR block 高亮、字段复核列表、技术详情折叠区样式。
  - 保持操作台风格：信息密度适中、低装饰、清晰按钮层级。

---

## Task 1: New Recognition Behavior Tests

**Files:**
- Modify: `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`
- Modify later: `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`

- [ ] **Step 1: Write the failing test for built-in OCR and storage capabilities**

Add these imports:

```ts
import {
  LOCAL_PADDLE_OCR_PROVIDER_KEY,
  getRecognitionCapabilitySummary,
} from "./NewRecognitionPage";
```

Add this test:

```ts
it("能力摘要把 OCR 和 Storage 显示成内置能力，只把 LLM 显示成待配置或已连接", () => {
  expect(getRecognitionCapabilitySummary([])).toEqual([
    {
      key: "ocr",
      label: "本地 OCR",
      value: "PaddleOCR",
      status: "ready",
      description: "本项目固定使用本机 PaddleOCR，不需要录入 OCR Endpoint。"
    },
    {
      key: "storage",
      label: "文件保存",
      value: "内置本地存储",
      status: "ready",
      description: "识别文件和中间结果先写入项目内置保存策略。"
    },
    {
      key: "llm",
      label: "模型提供商",
      value: "待配置",
      status: "blocked",
      description: "请先在识别能力检查中配置一个可用模型。"
    }
  ]);

  expect(
    getRecognitionCapabilitySummary([
      {
        value: "deepseek-chat",
        label: "DeepSeek Chat"
      }
    ])[2]
  ).toEqual({
    key: "llm",
    label: "模型提供商",
    value: "DeepSeek Chat",
    status: "ready",
    description: "结构化抽取会使用当前选中的模型提供商。"
  });
});
```

- [ ] **Step 2: Write the failing test for the new recognition gate**

Replace the old OCR/LLM gate expectation with:

```ts
it("新建识别只要求模型提供商，本地 PaddleOCR 和内置存储不再要求用户配置 Provider", () => {
  const response = {
    items: [
      { key: "mock-ocr", kind: "ocr", name: "Mock OCR Provider", isMock: true },
      { key: "mock-model", kind: "llm", name: "Mock Model Provider", isMock: true }
    ]
  };
  const llmProviders = parseProviderOptions(response, "llm");

  expect(getVisibleRecognitionProviderOptions(response, "ocr").mockOnly).toBe(true);
  expect(getRecognitionProviderGate(llmProviders)).toEqual({
    canCreate: false,
    message: "请先配置模型提供商；本地 PaddleOCR 和内置文件保存已作为项目内置能力。"
  });

  expect(
    getRecognitionProviderGate([
      {
        value: "openai-compatible-model",
        label: "OpenAI-compatible Provider"
      }
    ])
  ).toEqual({
    canCreate: true,
    message: "本地 PaddleOCR、内置文件保存和模型提供商均已就绪。"
  });
});
```

- [ ] **Step 3: Write the failing test for local OCR key in upload metadata**

In the existing upload input tests, change expected OCR provider from `"http-ocr"` to `LOCAL_PADDLE_OCR_PROVIDER_KEY`:

```ts
expect(metadata.ocrProvider).toBe(LOCAL_PADDLE_OCR_PROVIDER_KEY);
```

- [ ] **Step 4: Run the targeted test and verify RED**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts
```

Expected:

```text
FAIL
getRecognitionCapabilitySummary is not exported
LOCAL_PADDLE_OCR_PROVIDER_KEY is not exported
getRecognitionProviderGate receives the old two-argument contract
```

Do not implement until this failure is observed.

---

## Task 2: New Recognition Page Implementation

**Files:**
- Modify: `apps/demo-web/src/pages/recognition/NewRecognitionPage.tsx`
- Test: `apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts`

- [ ] **Step 1: Add local OCR constants and capability summary types**

Add near existing constants:

```ts
export const LOCAL_PADDLE_OCR_PROVIDER_KEY = "local-paddleocr";

type RecognitionCapabilityStatus = "ready" | "blocked" | "checking";

type RecognitionCapabilitySummaryItem = {
  key: "ocr" | "storage" | "llm";
  label: string;
  value: string;
  status: RecognitionCapabilityStatus;
  description: string;
};
```

- [ ] **Step 2: Implement the capability summary helper**

Add this helper near `getRecognitionProviderGate`:

```ts
export function getRecognitionCapabilitySummary(llmProviders: SelectOption[]): RecognitionCapabilitySummaryItem[] {
  const currentModel = llmProviders[0];

  return [
    {
      key: "ocr",
      label: "本地 OCR",
      value: "PaddleOCR",
      status: "ready",
      description: "本项目固定使用本机 PaddleOCR，不需要录入 OCR Endpoint。"
    },
    {
      key: "storage",
      label: "文件保存",
      value: "内置本地存储",
      status: "ready",
      description: "识别文件和中间结果先写入项目内置保存策略。"
    },
    {
      key: "llm",
      label: "模型提供商",
      value: currentModel?.label ?? "待配置",
      status: currentModel ? "ready" : "blocked",
      description: currentModel ? "结构化抽取会使用当前选中的模型提供商。" : "请先在识别能力检查中配置一个可用模型。"
    }
  ];
}
```

- [ ] **Step 3: Change provider gate to LLM-only**

Replace the old function:

```ts
export function getRecognitionProviderGate(ocrProviders: SelectOption[], llmProviders: SelectOption[]) {
  const canCreate = ocrProviders.length > 0 && llmProviders.length > 0;

  return {
    canCreate,
    message: canCreate ? "真实 OCR/LLM Provider 已选择。" : "请先配置真实 OCR/LLM Provider；等待接入真实模型提供商。"
  };
}
```

with:

```ts
export function getRecognitionProviderGate(llmProviders: SelectOption[]) {
  const canCreate = llmProviders.length > 0;

  return {
    canCreate,
    message: canCreate
      ? "本地 PaddleOCR、内置文件保存和模型提供商均已就绪。"
      : "请先配置模型提供商；本地 PaddleOCR 和内置文件保存已作为项目内置能力。"
  };
}
```

- [ ] **Step 4: Remove OCR provider state from the form flow**

Keep `getVisibleRecognitionProviderOptions` exported for existing tests and compatibility, but stop using OCR choices in `NewRecognitionPage`.

Remove these state variables from the page component:

```ts
const [ocrProviderChoices, setOcrProviderChoices] = useState<SelectOption[]>(fallbackProviderOptions);
const [ocrProvider, setOcrProvider] = useState(fallbackProviderOptions[0]?.value ?? "");
```

In `loadOptions`, remove `nextOcrProviders` and these setters:

```ts
setOcrProviderChoices(nextOcrProviders);
setOcrProvider((current) =>
  nextOcrProviders.some((item) => item.value === current) ? current : nextOcrProviders[0]?.value ?? ""
);
```

In the error branch, remove:

```ts
setOcrProviderChoices([]);
setOcrProvider("");
```

- [ ] **Step 5: Use local PaddleOCR key during submit**

In `submitRecognition`, pass the constant:

```ts
await submitRecognition({
  file,
  schemaName,
  adapter,
  ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
  provider,
  privacy
});
```

- [ ] **Step 6: Remove synthetic sample submit path**

Delete:

```ts
export function createSyntheticRecognitionFile() { ... }
function handleSyntheticSubmit() { ... }
```

If tests still need `createSyntheticRecognitionFile`, keep it exported as a pure test helper for now, but remove the UI button and handler from the page component. The product UI must not show a synthetic sample entry.

- [ ] **Step 7: Remove writeback privacy option from the visible UI**

Keep the API payload shape stable by retaining `allowWriteBack: false` in `initialPrivacyOptions`, but remove it from `privacyOptionContent`.

Change:

```ts
const privacyOptionContent = {
  deidentify: { ... },
  keepEvidence: { ... },
  allowWriteBack: { ... },
} as const satisfies Record<keyof PrivacyOptions, ...>;
```

to a visible-only map:

```ts
const visiblePrivacyOptionContent = {
  deidentify: {
    icon: actionIcons.privacyPolicy,
    title: "开启患者信息脱敏",
    description: "上传、评测和展示链路默认移除患者身份信息，降低 PHI 暴露风险。"
  },
  keepEvidence: {
    icon: dashboardMetricIcons.decisionPass,
    title: "保留字段证据链",
    description: "保留页码、原文引用和字段来源，便于复核人员追溯模型判断。"
  }
} as const satisfies Record<
  Exclude<keyof PrivacyOptions, "allowWriteBack">,
  {
    icon: LucideIcon;
    title: string;
    description: string;
  }
>;
```

Update render loop to:

```tsx
{(Object.keys(visiblePrivacyOptionContent) as Array<keyof typeof visiblePrivacyOptionContent>).map((key) => {
  const option = visiblePrivacyOptionContent[key];
  const checked = privacy[key];
  ...
})}
```

- [ ] **Step 8: Render capability status above upload**

Compute:

```ts
const capabilitySummary = getRecognitionCapabilitySummary(llmProviderChoices);
const providerGate = getRecognitionProviderGate(llmProviderChoices);
```

Add a card before upload:

```tsx
<Card className="panel recognition-capability-card">
  <SectionTitle title="识别能力" />
  <div className="recognition-capability-list">
    {capabilitySummary.map((item) => (
      <article key={item.key} className={`recognition-capability-item is-${item.status}`}>
        <StatusPill label={item.status === "ready" ? "已就绪" : item.status === "checking" ? "检查中" : "待配置"} tone={item.status === "ready" ? "completed" : item.status === "checking" ? "running" : "failed"} />
        <div>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
          <p>{item.description}</p>
        </div>
      </article>
    ))}
  </div>
  {!providerGate.canCreate ? (
    <Alert type="warning" showIcon content={providerGate.message} />
  ) : null}
</Card>
```

- [ ] **Step 9: Simplify config card**

Remove the OCR Provider `Form.Item` entirely.

Keep:

```tsx
<Form.Item label="Schema 模板" data-guide="schema-selection">...</Form.Item>
<Form.Item label="文档类型">...</Form.Item>
<Form.Item label="模型提供商">...</Form.Item>
```

Rename Adapter label:

```tsx
<Form.Item label="文档类型">
```

Keep the existing adapter values for now.

- [ ] **Step 10: Update header copy**

Change page description to:

```tsx
description="上传病历图片或 PDF，选择识别模板后创建任务；OCR 使用本地 PaddleOCR，文件使用内置本地保存策略。"
```

Change meta writeback item to model item:

```tsx
<span className="page-header__meta-item">
  <strong>模型</strong>
  <span>{llmProviderChoices[0]?.label ?? "待配置"}</span>
</span>
```

- [ ] **Step 11: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts
```

Expected:

```text
PASS apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts
```

---

## Task 3: Job Detail Review Data Helpers Tests

**Files:**
- Modify: `apps/demo-web/src/pages/recognition/JobDetailPage.test.ts`
- Modify later: `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`

- [ ] **Step 1: Write failing tests for review summary and field ordering**

Add imports:

```ts
import {
  buildReviewFieldRows,
  buildReviewSummary,
  buildTaskTimeline,
} from "./JobDetailPage";
```

Add tests:

```ts
describe("review workspace helpers", () => {
  it("汇总详情页第一屏需要展示的任务结论", () => {
    expect(
      buildReviewSummary({
        status: "needs_review",
        fields: [
          { field: "主诉", value: "咳嗽", confidence: 0.93, source: "第 1 页 block-1", decision: "green" },
          { field: "现病史", value: "", confidence: 0.42, source: "第 1 页 block-2", decision: "yellow" },
          { field: "过敏史", value: "", confidence: 0.2, source: "第 2 页 block-4", decision: "red" }
        ],
        evidence: [
          { id: "block-1", field: "主诉", quote: "主诉：咳嗽", page: 1, confidence: 0.93 }
        ],
        ocrText: "主诉：咳嗽"
      })
    ).toEqual({
      statusLabel: "等待复核",
      pendingFieldCount: 2,
      highConfidenceFieldCount: 1,
      warningCount: 2,
      evidenceCount: 1,
      hasOcrText: true
    });
  });

  it("字段列表默认把待处理字段排在已通过字段前面", () => {
    expect(
      buildReviewFieldRows([
        { field: "主诉", value: "咳嗽", confidence: 0.93, source: "第 1 页 block-1", decision: "green" },
        { field: "过敏史", value: "", confidence: 0.2, source: "第 2 页 block-4", decision: "red" },
        { field: "现病史", value: "发热", confidence: 0.61, source: "第 1 页 block-2", decision: "yellow" }
      ]).map((row) => row.field)
    ).toEqual(["过敏史", "现病史", "主诉"]);
  });
});
```

- [ ] **Step 2: Write failing tests for timeline mapping**

Add:

```ts
it("把任务状态映射成用户可读的识别进度时间线", () => {
  expect(buildTaskTimeline("ocr_running")).toEqual([
    { key: "uploaded", label: "上传完成", status: "done" },
    { key: "stored", label: "文件保存完成", status: "done" },
    { key: "ocr", label: "PaddleOCR 识别中", status: "active" },
    { key: "extract", label: "模型抽取", status: "pending" },
    { key: "validate", label: "字段校验", status: "pending" },
    { key: "review", label: "等待复核", status: "pending" }
  ]);

  expect(buildTaskTimeline("failed", "模型 API Key 无效").find((item) => item.status === "failed")).toEqual({
    key: "failed",
    label: "识别失败",
    status: "failed",
    message: "模型 API Key 无效"
  });
});
```

- [ ] **Step 3: Run the targeted test and verify RED**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/pages/recognition/JobDetailPage.test.ts
```

Expected:

```text
FAIL
buildReviewSummary is not exported
buildReviewFieldRows is not exported
buildTaskTimeline is not exported
```

---

## Task 4: Job Detail Review Workspace Implementation

**Files:**
- Modify: `apps/demo-web/src/pages/recognition/JobDetailPage.tsx`
- Test: `apps/demo-web/src/pages/recognition/JobDetailPage.test.ts`

- [ ] **Step 1: Add review helper types and functions**

Add near existing type definitions:

```ts
type ReviewFieldStatus = "passed" | "low_confidence" | "missing" | "conflict" | "modified" | "unconfirmed";

type ReviewFieldRow = FieldCandidate & {
  reviewStatus: ReviewFieldStatus;
  originalValue: string;
  confirmedValue: string;
};

type ReviewSummaryInput = {
  status?: string;
  fields: FieldCandidate[];
  evidence: EvidenceItem[];
  ocrText: string;
};

type TimelineItem = {
  key: string;
  label: string;
  status: "done" | "active" | "pending" | "failed";
  message?: string;
};
```

Add helpers:

```ts
function mapFieldStatus(candidate: FieldCandidate): ReviewFieldStatus {
  if (!candidate.value) {
    return "missing";
  }
  if (candidate.decision === "red") {
    return "conflict";
  }
  if (candidate.decision === "yellow" || candidate.confidence < 0.75) {
    return "low_confidence";
  }
  return "passed";
}

export function buildReviewFieldRows(fields: FieldCandidate[]): ReviewFieldRow[] {
  const rank: Record<ReviewFieldStatus, number> = {
    missing: 0,
    conflict: 1,
    low_confidence: 2,
    modified: 3,
    unconfirmed: 4,
    passed: 5
  };

  return fields
    .map((field) => ({
      ...field,
      reviewStatus: mapFieldStatus(field),
      originalValue: field.value,
      confirmedValue: field.value
    }))
    .sort((left, right) => rank[left.reviewStatus] - rank[right.reviewStatus]);
}

export function buildReviewSummary(input: ReviewSummaryInput) {
  const rows = buildReviewFieldRows(input.fields);
  const pendingFieldCount = rows.filter((row) => row.reviewStatus !== "passed").length;
  const highConfidenceFieldCount = rows.filter((row) => row.reviewStatus === "passed").length;

  return {
    statusLabel:
      input.status === "failed"
        ? "识别失败"
        : input.status === "completed"
          ? "已完成"
          : input.status === "needs_review"
            ? "等待复核"
            : "处理中",
    pendingFieldCount,
    highConfidenceFieldCount,
    warningCount: pendingFieldCount,
    evidenceCount: input.evidence.length,
    hasOcrText: input.ocrText.trim().length > 0
  };
}
```

- [ ] **Step 2: Add timeline helper**

Add:

```ts
export function buildTaskTimeline(status: string | undefined, failedMessage?: string): TimelineItem[] {
  if (status === "failed") {
    return [
      { key: "uploaded", label: "上传完成", status: "done" },
      { key: "stored", label: "文件保存完成", status: "done" },
      { key: "failed", label: "识别失败", status: "failed", message: failedMessage ?? "任务执行失败，请检查识别能力后重试。" },
      { key: "review", label: "等待复核", status: "pending" }
    ];
  }

  const activeKey =
    status === "ocr_running"
      ? "ocr"
      : status === "extracting"
        ? "extract"
        : status === "validating"
          ? "validate"
          : status === "needs_review" || status === "completed"
            ? "review"
            : "uploaded";
  const order = ["uploaded", "stored", "ocr", "extract", "validate", "review"];
  const activeIndex = order.indexOf(activeKey);

  return [
    { key: "uploaded", label: "上传完成", status: activeIndex > 0 ? "done" : activeKey === "uploaded" ? "active" : "pending" },
    { key: "stored", label: "文件保存完成", status: activeIndex > 1 ? "done" : activeKey === "stored" ? "active" : "pending" },
    { key: "ocr", label: activeKey === "ocr" ? "PaddleOCR 识别中" : "PaddleOCR 识别完成", status: activeIndex > 2 ? "done" : activeKey === "ocr" ? "active" : "pending" },
    { key: "extract", label: "模型抽取", status: activeIndex > 3 ? "done" : activeKey === "extract" ? "active" : "pending" },
    { key: "validate", label: "字段校验", status: activeIndex > 4 ? "done" : activeKey === "validate" ? "active" : "pending" },
    { key: "review", label: "等待复核", status: status === "completed" ? "done" : activeKey === "review" ? "active" : "pending" }
  ];
}
```

- [ ] **Step 3: Change page header and remove writeback action**

Replace header:

```tsx
title={`任务详情 ${displayJobId}`}
description="查看文档预览、OCR 文本、字段候选、证据、Payload、LangGraph trace 与人工反馈。"
```

with:

```tsx
title="识别结果复核"
description={`${displayJobId} · 查看原件、OCR 文本、结构化字段和证据，确认后保存复核结果。`}
```

Remove `handleGoWriteback` and the primary writeback button.

Keep a secondary document button:

```tsx
<Button type="outline" aria-label="打开原始文档" ...>
  {documentPreview.status === "loading" ? "读取中" : "原始文档"}
</Button>
```

- [ ] **Step 4: Render top summary metric cards**

Compute:

```ts
const reviewRows = buildReviewFieldRows(displayFields);
const reviewSummary = buildReviewSummary({
  status: apiDetail.status,
  fields: displayFields,
  evidence: displayEvidenceItems,
  ocrText: displayOcrText
});
const timelineItems = buildTaskTimeline(apiDetail.status, loadError);
```

Render after alert:

```tsx
<section className="metric-grid" aria-label="识别复核摘要">
  <MetricCard label="任务状态" value={reviewSummary.statusLabel} description="当前识别流程状态" icon={statusIcons.running} tone="info" />
  <MetricCard label="待复核字段" value={`${reviewSummary.pendingFieldCount}`} description="缺失、冲突或低置信字段" icon={dashboardMetricIcons.reviewQueue} tone={reviewSummary.pendingFieldCount > 0 ? "warning" : "success"} />
  <MetricCard label="高置信字段" value={`${reviewSummary.highConfidenceFieldCount}`} description="可直接采纳的字段" icon={dashboardMetricIcons.decisionPass} tone="success" />
  <MetricCard label="质量告警" value={`${reviewSummary.warningCount}`} description="需要人工关注的问题" icon={statusIcons.warning} tone={reviewSummary.warningCount > 0 ? "warning" : "neutral"} />
</section>
```

- [ ] **Step 5: Render progress timeline**

Add:

```tsx
<Card className="panel recognition-timeline-card">
  <SectionTitle title="识别进度" />
  <ol className="recognition-timeline">
    {timelineItems.map((item) => (
      <li key={item.key} className={`recognition-timeline__item is-${item.status}`}>
        <span>{item.label}</span>
        {item.message ? <p>{item.message}</p> : null}
      </li>
    ))}
  </ol>
</Card>
```

- [ ] **Step 6: Rework main workspace layout**

Use:

```tsx
<div className="review-workspace">
  <section className="review-workspace__source">
    ... document preview ...
    ... OCR text ...
  </section>
  <section className="review-workspace__fields">
    ... field review rows ...
  </section>
</div>
```

Keep document preview display exactly as current behavior: images render as `<img>`, PDF renders via `<object>`, no coordinate boxes.

- [ ] **Step 7: Replace field table with review list**

Render `reviewRows` as list cards instead of a wide table:

```tsx
<div className="review-field-list">
  {reviewRows.map((field) => (
    <button
      key={field.field}
      type="button"
      className={`review-field-row is-${field.reviewStatus}`}
      onClick={() => setFeedback((current) => ({ ...current, field: field.field, correctedValue: field.confirmedValue }))}
    >
      <span>{field.field}</span>
      <strong>{field.confirmedValue || "未识别"}</strong>
      <small>模型值：{field.originalValue || "空"}</small>
      <StatusPill label={field.reviewStatus === "passed" ? "已通过" : field.reviewStatus === "missing" ? "缺失" : field.reviewStatus === "conflict" ? "冲突" : "低置信"} tone={field.reviewStatus === "passed" ? "completed" : field.reviewStatus === "conflict" ? "failed" : "review"} />
    </button>
  ))}
</div>
```

- [ ] **Step 8: Replace feedback form copy with review copy**

Rename section:

```tsx
<SectionTitle title="字段复核" />
```

Primary button:

```tsx
{submitState === "loading" ? "保存中" : "保存复核"}
```

Remove writeback-oriented wording from descriptions.

- [ ] **Step 9: Move Payload and Trace into technical details**

Use native details:

```tsx
<details className="technical-details">
  <summary>技术详情</summary>
  <div className="detail-grid">
    <Card className="panel">
      <SectionTitle title="Payload" />
      <pre className="payload-preview">{JSON.stringify(displayPayload, null, 2)}</pre>
    </Card>
    <Card className="panel" data-guide="langgraph-workflow">
      <SectionTitle title="LangGraph Trace" />
      ...
    </Card>
  </div>
</details>
```

- [ ] **Step 10: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/pages/recognition/JobDetailPage.test.ts
```

Expected:

```text
PASS apps/demo-web/src/pages/recognition/JobDetailPage.test.ts
```

---

## Task 5: UX Styles For Create And Review Pages

**Files:**
- Modify: `apps/demo-web/src/styles.css`
- Related components: `NewRecognitionPage.tsx`, `JobDetailPage.tsx`

- [ ] **Step 1: Add recognition capability styles**

Add near existing recognition styles:

```css
.recognition-capability-card .arco-card-body {
  display: grid;
  gap: var(--space-4);
}

.recognition-capability-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.recognition-capability-item {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-4);
  background: #FAFBFC;
}

.recognition-capability-item > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.recognition-capability-item strong {
  color: var(--color-title);
  font-size: 14px;
  line-height: 20px;
}

.recognition-capability-item span,
.recognition-capability-item p {
  margin: 0;
  color: var(--color-text);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.recognition-capability-item.is-blocked {
  border-color: #FFB9B0;
  background: var(--color-danger-soft);
}
```

- [ ] **Step 2: Add review workspace styles**

Add:

```css
.review-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: var(--space-6);
  align-items: start;
}

.review-workspace__source,
.review-workspace__fields {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.review-field-list {
  display: grid;
  gap: var(--space-3);
}

.review-field-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.75fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-3) var(--space-4);
  background: #FFFFFF;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.review-field-row:hover,
.review-field-row:focus-visible {
  border-color: #BEDAFF;
  box-shadow: var(--shadow-1);
}

.review-field-row strong,
.review-field-row small,
.review-field-row span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.review-field-row strong {
  color: var(--color-title);
  font-size: 14px;
  line-height: 20px;
}

.review-field-row small {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 18px;
}

.review-field-row.is-missing,
.review-field-row.is-conflict,
.review-field-row.is-low_confidence {
  background: #FFF7E8;
}
```

- [ ] **Step 3: Add timeline and technical details styles**

Add:

```css
.recognition-timeline {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.recognition-timeline__item {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  background: #F7F8FA;
}

.recognition-timeline__item span {
  display: block;
  color: var(--color-title);
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
}

.recognition-timeline__item p {
  margin: var(--space-2) 0 0;
  color: var(--color-text);
  font-size: 12px;
  line-height: 18px;
}

.recognition-timeline__item.is-done {
  border-color: #95E0A6;
  background: var(--color-success-soft);
}

.recognition-timeline__item.is-active {
  border-color: #A9C5FF;
  background: var(--color-primary-soft);
}

.recognition-timeline__item.is-failed {
  border-color: #FFB9B0;
  background: var(--color-danger-soft);
}

.technical-details {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: #FFFFFF;
  padding: var(--space-4);
}

.technical-details summary {
  min-height: 44px;
  color: var(--color-title);
  font-weight: 700;
  cursor: pointer;
}
```

- [ ] **Step 4: Add responsive rules**

Add under existing mobile media rules:

```css
@media (max-width: 900px) {
  .recognition-capability-list,
  .review-workspace,
  .recognition-timeline {
    grid-template-columns: 1fr;
  }

  .review-field-row {
    grid-template-columns: 1fr;
    align-items: start;
  }
}
```

- [ ] **Step 5: Run style guard tests**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/ui-arco-style-guards.test.ts
```

Expected:

```text
PASS apps/demo-web/src/ui-arco-style-guards.test.ts
```

---

## Task 6: Route Smoke And Browser Verification

**Files:**
- No source edits expected unless verification finds a UX break.

- [ ] **Step 1: Run targeted frontend tests**

Run:

```powershell
corepack pnpm vitest run apps/demo-web/src/pages/recognition/NewRecognitionPage.test.ts apps/demo-web/src/pages/recognition/JobDetailPage.test.ts apps/demo-web/src/ui-arco-style-guards.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run demo web smoke if available**

Run:

```powershell
corepack pnpm smoke:demo-web
```

Expected:

```text
smoke passes or reports only known external API blockers
```

If it reports API blockers, record exact blocker text in the final handoff.

- [ ] **Step 3: Start local web dev server**

Run:

```powershell
corepack pnpm dev:web
```

Expected:

```text
Vite dev server starts and prints a localhost URL
```

If the default port is occupied, use the next available port printed by Vite.

- [ ] **Step 4: Browser check `/recognition/new`**

Open the dev URL in the in-app Browser or Chrome plugin and navigate to:

```text
/recognition/new
```

Check:

- Page title is “新建识别任务”.
- First content section is “识别能力”.
- OCR shows “PaddleOCR”.
- Storage shows “内置本地存储”.
- No OCR Provider select appears.
- No LIMS/writeback option appears.
- No “合成样本” button appears.
- Primary CTA is “开始识别”.
- Upload zone text fits on mobile width.

- [ ] **Step 5: Browser check `/recognition/jobs/demo`**

Navigate to:

```text
/recognition/jobs/demo
```

Check:

- Page title is “识别结果复核”.
- No “确认写回” primary button appears.
- Original document preview area is visible.
- OCR text section is visible.
- Field review list is visible.
- Technical details are collapsed by default.
- Mobile width does not produce horizontal page scroll.

---

## Self-Review

- Spec coverage: 新建识别页、详情页、PaddleOCR 固定展示、内置 Storage、去掉合成样本、隐藏 LIMS/writeback、原件展示不做坐标框、证据先联动 OCR 文本均有任务覆盖。
- Placeholder scan: 本计划不包含空泛待办作为任务步骤；后续能力被明确列在 out-of-scope。
- Type consistency: `LOCAL_PADDLE_OCR_PROVIDER_KEY`、`getRecognitionCapabilitySummary`、`getRecognitionProviderGate`、`buildReviewSummary`、`buildReviewFieldRows`、`buildTaskTimeline` 在测试和实现任务中名称一致。
- Git boundary: 本计划不包含 commit 步骤，符合当前 AGENTS.md “没有明确说提交到 git，不允许提交”。
