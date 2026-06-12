import type { LucideIcon } from "lucide-react";
import { actionIcons } from "../../../icons/appIcons";

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

export const dashboardActions = [
  { label: "新建识别", icon: actionIcons.createRecognition },
  { label: "查看流程", icon: actionIcons.viewFlow },
  { label: "隐私策略", icon: actionIcons.privacyPolicy },
] as const;

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
