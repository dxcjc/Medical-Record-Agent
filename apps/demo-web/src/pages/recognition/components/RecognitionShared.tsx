import type { LucideIcon } from "lucide-react";
import { Button, Card, Empty, Space, Tag } from "@arco-design/web-react";
import { AppIcon, actionIcons, statusIcons } from "../../../icons/appIcons";
import type { DecisionLevel, ProviderHealth, RecognitionStatus } from "./demoData";
import { decisionLabels, providerHealthLabels, statusLabels } from "./demoData";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
};

export type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";
type TrendDirection = "up" | "down";

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: MetricTone;
  trend?: {
    direction: TrendDirection;
    label: string;
  };
};

type StatusPillProps = {
  label: string;
  tone: RecognitionStatus | ProviderHealth | DecisionLevel | "neutral";
};

type EmptyPanelProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
};

const toneClassMap: Record<StatusPillProps["tone"], string> = {
  queued: "is-neutral",
  running: "is-info",
  review: "is-warning",
  completed: "is-success",
  failed: "is-danger",
  online: "is-success",
  degraded: "is-warning",
  offline: "is-danger",
  green: "is-success",
  yellow: "is-warning",
  red: "is-danger",
  neutral: "is-neutral",
};

const tagColorMap: Record<StatusPillProps["tone"], string> = {
  queued: "gray",
  running: "arcoblue",
  review: "orange",
  completed: "green",
  failed: "red",
  online: "green",
  degraded: "orange",
  offline: "red",
  green: "green",
  yellow: "orange",
  red: "red",
  neutral: "gray",
};

const metricToneClassMap: Record<MetricTone, string> = {
  neutral: "metric-card--neutral",
  success: "metric-card--success",
  warning: "metric-card--warning",
  danger: "metric-card--danger",
  info: "metric-card--info",
};

const metricTileToneMap: Record<MetricTone, "blue" | "green" | "orange" | "red" | "gray"> = {
  neutral: "gray",
  success: "green",
  warning: "orange",
  danger: "red",
  info: "blue",
};

export function PageHeader({ eyebrow, title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className="page-header u-surface">
      <div className="u-stack">
        <p className="page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {meta}
      </div>
      {actions ? <div className="page-header__actions u-cluster">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({ label, value, description, icon: Icon, tone = "info", trend }: MetricCardProps) {
  const TrendIcon = trend?.direction === "down" ? actionIcons.trendDown : actionIcons.trendUp;

  return (
    <Card className={`metric-card u-surface ${metricToneClassMap[tone]}`}>
      <div className="metric-card__icon" aria-hidden="true">
        <AppIcon icon={Icon} size="md" tone={metricTileToneMap[tone]} tile />
      </div>
      <div className="metric-card__body">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{description}</span>
      </div>
      {trend ? (
        <div className={`metric-card__trend is-${trend.direction}`}>
          <AppIcon icon={TrendIcon} size="xs" />
          {trend.label}
        </div>
      ) : null}
    </Card>
  );
}

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <Tag color={tagColorMap[tone]} className={`status-pill ${toneClassMap[tone]}`}>
      <AppIcon icon={statusIcons[tone]} size="xs" className={tone === "running" ? "is-spinning" : undefined} />
      {label}
    </Tag>
  );
}

export function JobStatusPill({ status }: { status: RecognitionStatus }) {
  return <StatusPill label={statusLabels[status]} tone={status} />;
}

export function ProviderHealthPill({ health }: { health: ProviderHealth }) {
  return <StatusPill label={providerHealthLabels[health]} tone={health} />;
}

export function DecisionPill({ decision }: { decision: DecisionLevel }) {
  return <StatusPill label={decisionLabels[decision]} tone={decision} />;
}

export function EmptyPanel({ icon: Icon, title, description, action }: EmptyPanelProps) {
  return (
    <Card className="panel empty-panel u-surface">
      <Empty
        icon={<AppIcon icon={Icon} size="lg" tone="blue" tile />}
        description={
          <Space direction="vertical" size={4}>
            <span className="empty-panel-title">{title}</span>
            <span className="page-subtle-note">{description}</span>
            {action}
          </Space>
        }
      />
    </Card>
  );
}

export function SectionTitle({ title, actionLabel, action }: { title: string; actionLabel?: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action ?? (actionLabel ? (
        <Button type="outline" aria-label={actionLabel}>
          {actionLabel}
          <AppIcon icon={actionIcons.next} size="sm" />
        </Button>
      ) : null)}
    </div>
  );
}
