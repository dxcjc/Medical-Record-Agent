export type DatasetStatus = "ready" | "importing" | "blocked";

export type GroundTruthStatus = "verified" | "partial" | "missing";

export type EvaluationDataset = {
  id: string;
  name: string;
  scenario: string;
  sampleCount: number;
  status: DatasetStatus;
  groundTruthStatus: GroundTruthStatus;
  deidentified: boolean;
  owner: string;
  updatedAt: string;
};

export type ImportFlowState = {
  sourceType: "CSV" | "JSONL" | "人工抽样";
  fileName: string;
  sampleImportStatus: "未开始" | "校验中" | "已导入";
  groundTruthStatusText: "等待导入" | "字段匹配中" | "已完成";
  groundTruthFieldKey: string;
  groundTruthValue: string;
  predictedValue: string;
  expectedNeedsReview: boolean;
};

export type EvaluationRunDraft = {
  name: string;
  schemaVersion: string;
  modelVersion: string;
  sampleScope: string;
};

export type EvaluationRun = {
  id: string;
  name: string;
  datasetName: string;
  schemaVersion: string;
  modelVersion: string;
  status: "排队中" | "运行中" | "已完成";
  createdAt: string;
};

export type MetricCardData = {
  id: string;
  label: string;
  value: string;
  delta: string;
  detail: string;
};

export type VersionComparisonRow = {
  metric: string;
  baseline: string;
  candidate: string;
  verdict: "提升" | "持平" | "下降" | "需复核";
};

export const datasets: EvaluationDataset[] = [
  {
    id: "ds-admission-0605",
    name: "入院记录抽取评测集",
    scenario: "病史结构化",
    sampleCount: 240,
    status: "ready",
    groundTruthStatus: "verified",
    deidentified: true,
    owner: "质控运营组",
    updatedAt: "2026-06-05 08:40"
  },
  {
    id: "ds-lab-0604",
    name: "检验单归一化评测集",
    scenario: "检验结果结构化",
    sampleCount: 180,
    status: "importing",
    groundTruthStatus: "partial",
    deidentified: true,
    owner: "检验运营组",
    updatedAt: "2026-06-04 19:15"
  },
  {
    id: "ds-discharge-0603",
    name: "出院小结端到端评测集",
    scenario: "出院摘要生成",
    sampleCount: 96,
    status: "blocked",
    groundTruthStatus: "missing",
    deidentified: false,
    owner: "病案运营组",
    updatedAt: "2026-06-03 21:05"
  }
];

export const initialImportFlow: ImportFlowState = {
  sourceType: "CSV",
  fileName: "admission_eval_samples_0605.csv",
  sampleImportStatus: "未开始",
  groundTruthStatusText: "等待导入",
  groundTruthFieldKey: "clinicalDiagnosis",
  groundTruthValue: "肺腺癌",
  predictedValue: "肺腺癌",
  expectedNeedsReview: false
};

export const initialRunDraft: EvaluationRunDraft = {
  name: "病史结构化 v3.5 候选评测",
  schemaVersion: "medical-history@v3.5.0-draft",
  modelVersion: "extractor-2026-06-05",
  sampleScope: "全部已脱敏样本"
};

export const completedRuns: EvaluationRun[] = [
  {
    id: "run-901",
    name: "病史结构化 v3.4 生产基线",
    datasetName: "入院记录抽取评测集",
    schemaVersion: "medical-history@v3.4.1",
    modelVersion: "extractor-2026-06-01",
    status: "已完成",
    createdAt: "2026-06-04 18:32"
  },
  {
    id: "run-902",
    name: "病史结构化 v3.5 候选评测",
    datasetName: "入院记录抽取评测集",
    schemaVersion: "medical-history@v3.5.0-draft",
    modelVersion: "extractor-2026-06-05",
    status: "运行中",
    createdAt: "2026-06-05 09:18"
  }
];

export const metricCards: MetricCardData[] = [
  {
    id: "micro-f1",
    label: "Micro F1",
    value: "94.8%",
    delta: "+2.1%",
    detail: "核心字段整体抽取质量较生产基线提升。"
  },
  {
    id: "exact-match",
    label: "字段完全匹配",
    value: "91.6%",
    delta: "+1.4%",
    detail: "主诉、过敏史、既往史字段同时命中的样本占比。"
  },
  {
    id: "critical-error",
    label: "关键错误率",
    value: "0.7%",
    delta: "-0.5%",
    detail: "涉及禁忌、过敏、诊断错配的高风险错误。"
  },
  {
    id: "review-load",
    label: "人工复核量",
    value: "18",
    delta: "-9",
    detail: "低置信度或冲突样本需要运营复核。"
  }
];

export const versionComparisonRows: VersionComparisonRow[] = [
  {
    metric: "主诉字段 F1",
    baseline: "96.1%",
    candidate: "97.4%",
    verdict: "提升"
  },
  {
    metric: "过敏史枚举准确率",
    baseline: "92.8%",
    candidate: "95.6%",
    verdict: "提升"
  },
  {
    metric: "既往史否认句处理",
    baseline: "88.3%",
    candidate: "88.1%",
    verdict: "持平"
  },
  {
    metric: "未脱敏样本占比",
    baseline: "0.0%",
    candidate: "1.4%",
    verdict: "需复核"
  }
];

export const datasetStatusLabel: Record<DatasetStatus, string> = {
  ready: "可评测",
  importing: "导入中",
  blocked: "阻断"
};

export const groundTruthStatusLabel: Record<GroundTruthStatus, string> = {
  verified: "已核验",
  partial: "部分导入",
  missing: "缺失"
};
