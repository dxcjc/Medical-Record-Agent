import type { LucideIcon } from "lucide-react";
import { Activity, ArrowRight, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { DecisionLevel, ProviderHealth, RecognitionStatus } from "./demoData";
import { decisionLabels, providerHealthLabels, statusLabels } from "./demoData";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
};

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
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

const toneIconMap: Record<StatusPillProps["tone"], LucideIcon> = {
  queued: Clock3,
  running: Activity,
  review: CircleAlert,
  completed: CheckCircle2,
  failed: CircleAlert,
  online: CheckCircle2,
  degraded: CircleAlert,
  offline: CircleAlert,
  green: CheckCircle2,
  yellow: CircleAlert,
  red: CircleAlert,
  neutral: Activity,
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <p className="page-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({ label, value, description, icon: Icon }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card__icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{description}</span>
      </div>
    </article>
  );
}

export function StatusPill({ label, tone }: StatusPillProps) {
  const Icon = toneIconMap[tone];

  return (
    <span className={`status-pill ${toneClassMap[tone]}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
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
    <section className="panel empty-panel">
      <Icon size={28} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function SectionTitle({ title, actionLabel }: { title: string; actionLabel?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {actionLabel ? (
        <button className="secondary-button" type="button" aria-label={actionLabel}>
          {actionLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
