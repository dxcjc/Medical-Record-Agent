import type { LucideIcon } from "lucide-react";
import { actionIcons, dashboardMetricIcons } from "../../../icons/appIcons";

export type RecognitionStatus = "queued" | "running" | "review" | "completed" | "failed";

export type ProviderHealth = "online" | "degraded" | "offline";

export type DecisionLevel = "green" | "yellow" | "red";

export type RecognitionJob = {
  id: string;
  title: string;
  schemaName: string;
  adapter: string;
  provider: string;
  status: RecognitionStatus;
  confidence: number;
  createdAt: string;
  owner: string;
  autoWriteBack: boolean;
};

export type ProviderStatus = {
  name: string;
  health: ProviderHealth;
  latencyMs: number;
  successRate: number;
  activeJobs: number;
};

export type ReviewSummary = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  trend?: {
    direction: "up" | "down";
    label: string;
  };
};

export type FieldCandidate = {
  field: string;
  value: string;
  confidence: number;
  source: string;
  decision: DecisionLevel;
};

export type EvidenceItem = {
  id: string;
  field: string;
  quote: string;
  page: number;
  confidence: number;
};

export type TraceStep = {
  id: string;
  node: string;
  status: "done" | "active" | "blocked";
  durationMs: number;
  detail: string;
};

export type DecisionCard = {
  level: DecisionLevel;
  title: string;
  description: string;
  action: string;
};

export const statusLabels: Record<RecognitionStatus, string> = {
  queued: "排队中",
  running: "识别中",
  review: "待复核",
  completed: "已完成",
  failed: "失败",
};

export const providerHealthLabels: Record<ProviderHealth, string> = {
  online: "在线",
  degraded: "降级",
  offline: "离线",
};

export const decisionLabels: Record<DecisionLevel, string> = {
  green: "自动通过",
  yellow: "人工复核",
  red: "阻断写回",
};

export const dashboardMetrics: ReviewSummary[] = [
  {
    label: "今日任务",
    value: "128",
    description: "较昨日增加 18 单",
    icon: dashboardMetricIcons.taskVolume,
    tone: "info",
    trend: {
      direction: "up",
      label: "+16%",
    },
  },
  {
    label: "平均置信度",
    value: "92.4%",
    description: "高风险字段单独复核",
    icon: dashboardMetricIcons.confidence,
    tone: "success",
    trend: {
      direction: "up",
      label: "+2.1%",
    },
  },
  {
    label: "自动写回",
    value: "76",
    description: "绿色决策直接进入 HIS 草稿",
    icon: dashboardMetricIcons.writeback,
    tone: "success",
    trend: {
      direction: "up",
      label: "+9",
    },
  },
  {
    label: "待复核",
    value: "21",
    description: "黄色决策等待人工确认",
    icon: dashboardMetricIcons.reviewQueue,
    tone: "warning",
    trend: {
      direction: "down",
      label: "-4",
    },
  },
];

export const recentJobs: RecognitionJob[] = [
  {
    id: "REC-20260605-001",
    title: "门诊病历-合成样本A.pdf",
    schemaName: "门诊病历结构化模板",
    adapter: "OutpatientPdfAdapter",
    provider: "OpenAI Vision",
    status: "completed",
    confidence: 0.96,
    createdAt: "2026-06-05 09:12",
    owner: "复核组 A",
    autoWriteBack: true,
  },
  {
    id: "REC-20260605-002",
    title: "住院首页-合成样本B.jpg",
    schemaName: "住院首页抽取模板",
    adapter: "InpatientImageAdapter",
    provider: "Azure OCR",
    status: "review",
    confidence: 0.84,
    createdAt: "2026-06-05 09:34",
    owner: "复核组 B",
    autoWriteBack: false,
  },
  {
    id: "REC-20260605-003",
    title: "检验报告-合成样本C.pdf",
    schemaName: "检验报告字段模板",
    adapter: "LabReportAdapter",
    provider: "OpenAI Vision",
    status: "running",
    confidence: 0.72,
    createdAt: "2026-06-05 09:58",
    owner: "系统",
    autoWriteBack: false,
  },
  {
    id: "REC-20260605-004",
    title: "影像摘要-合成样本D.png",
    schemaName: "影像报告摘要模板",
    adapter: "ImagingAdapter",
    provider: "Local OCR",
    status: "failed",
    confidence: 0.31,
    createdAt: "2026-06-05 10:16",
    owner: "复核组 C",
    autoWriteBack: false,
  },
];

export const providerStatuses: ProviderStatus[] = [
  {
    name: "OpenAI Vision",
    health: "online",
    latencyMs: 1240,
    successRate: 0.982,
    activeJobs: 8,
  },
  {
    name: "Azure OCR",
    health: "degraded",
    latencyMs: 2180,
    successRate: 0.944,
    activeJobs: 5,
  },
  {
    name: "Local OCR",
    health: "online",
    latencyMs: 860,
    successRate: 0.917,
    activeJobs: 2,
  },
];

export const writeBackSummaries: ReviewSummary[] = [
  {
    label: "绿色自动决策",
    value: "61%",
    description: "字段完整且证据一致",
    icon: dashboardMetricIcons.decisionPass,
    tone: "success",
    trend: {
      direction: "up",
      label: "+5%",
    },
  },
  {
    label: "黄色人工复核",
    value: "31%",
    description: "低置信度或字段冲突",
    icon: dashboardMetricIcons.decisionReview,
    tone: "warning",
    trend: {
      direction: "down",
      label: "-3%",
    },
  },
  {
    label: "红色阻断",
    value: "8%",
    description: "缺少关键证据或隐私策略不允许",
    icon: dashboardMetricIcons.decisionBlock,
    tone: "danger",
    trend: {
      direction: "down",
      label: "-1%",
    },
  },
  {
    label: "回滚队列",
    value: "4",
    description: "等待管理员确认",
    icon: dashboardMetricIcons.rollback,
    tone: "neutral",
  },
];

export const schemaOptions = [
  "门诊病历结构化模板",
  "住院首页抽取模板",
  "检验报告字段模板",
  "影像报告摘要模板",
] as const;

export const adapterOptions = [
  "OutpatientPdfAdapter",
  "InpatientImageAdapter",
  "LabReportAdapter",
  "ImagingAdapter",
] as const;

export const providerOptions = ["OpenAI Vision", "Azure OCR", "Local OCR"] as const;

export const demoOcrText = [
  "主诉：反复咳嗽、咳痰 3 天，加重伴发热 1 天。",
  "现病史：患者 3 天前无明显诱因出现咳嗽，少量白痰，昨日体温最高 38.6℃。",
  "既往史：否认高血压、糖尿病史，否认药物过敏史。",
  "处理意见：完善血常规、CRP、胸部影像检查，给予对症治疗。",
].join("\n");

export const fieldCandidates: FieldCandidate[] = [
  {
    field: "主诉",
    value: "反复咳嗽、咳痰 3 天，加重伴发热 1 天",
    confidence: 0.97,
    source: "第 1 页第 2 段",
    decision: "green",
  },
  {
    field: "最高体温",
    value: "38.6℃",
    confidence: 0.91,
    source: "第 1 页第 3 段",
    decision: "green",
  },
  {
    field: "药物过敏史",
    value: "否认药物过敏史",
    confidence: 0.82,
    source: "第 1 页第 4 段",
    decision: "yellow",
  },
  {
    field: "诊断",
    value: "上呼吸道感染？",
    confidence: 0.58,
    source: "模型推断，原文未明确给出",
    decision: "red",
  },
];

export const evidenceItems: EvidenceItem[] = [
  {
    id: "E-01",
    field: "主诉",
    quote: "反复咳嗽、咳痰 3 天，加重伴发热 1 天",
    page: 1,
    confidence: 0.97,
  },
  {
    id: "E-02",
    field: "最高体温",
    quote: "昨日体温最高 38.6℃",
    page: 1,
    confidence: 0.91,
  },
  {
    id: "E-03",
    field: "诊断",
    quote: "原文未出现明确诊断，只能作为候选建议",
    page: 1,
    confidence: 0.58,
  },
];

export const traceSteps: TraceStep[] = [
  {
    id: "T-01",
    node: "document_intake",
    status: "done",
    durationMs: 420,
    detail: "完成文件类型识别、页数读取和隐私策略校验。",
  },
  {
    id: "T-02",
    node: "ocr_extract",
    status: "done",
    durationMs: 1580,
    detail: "抽取文本块并保留页码、段落和坐标线索。",
  },
  {
    id: "T-03",
    node: "field_grounding",
    status: "done",
    durationMs: 2360,
    detail: "将字段候选与原文证据进行绑定。",
  },
  {
    id: "T-04",
    node: "auto_decision",
    status: "active",
    durationMs: 740,
    detail: "根据置信度、证据完整度和写回策略生成绿黄红决策。",
  },
];

export const decisionCards: DecisionCard[] = [
  {
    level: "green",
    title: "绿色：可自动写回",
    description: "主诉、体温等字段证据清晰，满足自动写回阈值。",
    action: "写入草稿",
  },
  {
    level: "yellow",
    title: "黄色：需要复核",
    description: "过敏史字段置信度低于 85%，需要复核员确认。",
    action: "加入复核",
  },
  {
    level: "red",
    title: "红色：阻断",
    description: "诊断字段缺少明确原文证据，不允许自动写回。",
    action: "标记阻断",
  },
];

export const payloadPreview = {
  jobId: "REC-20260605-001",
  schema: "门诊病历结构化模板",
  writeBackMode: "draft",
  fields: {
    chiefComplaint: "反复咳嗽、咳痰 3 天，加重伴发热 1 天",
    maxTemperature: "38.6℃",
    allergyHistory: "否认药物过敏史",
    diagnosisSuggestion: null,
  },
  reviewRequired: ["allergyHistory", "diagnosisSuggestion"],
};

export const dashboardActions = [
  { label: "新建识别", icon: actionIcons.createRecognition },
  { label: "查看流程", icon: actionIcons.viewFlow },
  { label: "隐私策略", icon: actionIcons.privacyPolicy },
] as const;

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
