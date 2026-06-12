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
  status: "排队中" | "运行中" | "已完成" | "已失败";
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

export const datasets: EvaluationDataset[] = [];

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

export const completedRuns: EvaluationRun[] = [];

export const metricCards: MetricCardData[] = [];

export const versionComparisonRows: VersionComparisonRow[] = [];

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
