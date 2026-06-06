import type { ReactNode } from "react";
import { AppIcon, actionIcons, commonUiIcons, statusIcons } from "../../../icons/appIcons";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function SectionHeader({ eyebrow, title, description, actions }: SectionHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </header>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  tone?: StatusTone;
};

export function MetricCard({ label, value, hint, tone = "neutral" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

type StatusPillProps = {
  tone: StatusTone;
  children: ReactNode;
};

const statusIconMap: Record<StatusTone, ReactNode> = {
  success: <AppIcon icon={statusIcons.success} size="xs" />,
  warning: <AppIcon icon={statusIcons.warning} size="xs" />,
  danger: <AppIcon icon={statusIcons.danger} size="xs" />,
  info: <AppIcon icon={statusIcons.info} size="xs" />,
  neutral: <AppIcon icon={statusIcons.neutral} size="xs" />
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {statusIconMap[tone]}
      {children}
    </span>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="panel confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-dialog__header">
          <h2 id="confirm-title">{title}</h2>
          <button className="icon-button" type="button" aria-label="关闭确认弹窗" onClick={onCancel}>
            <AppIcon icon={commonUiIcons.close} size="md" />
          </button>
        </div>
        <p>{description}</p>
        <div className="toolbar">
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className={danger ? "danger-button" : "action-button"} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

type PayloadPreviewProps = {
  title: string;
  payload: unknown;
};

export function PayloadPreview({ title, payload }: PayloadPreviewProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  );
}

type SecretFieldProps = {
  label: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (nextValue: string) => void;
};

export function SecretField({ label, value, visible, onToggle, onChange }: SecretFieldProps) {
  return (
    <label className="secret-field">
      <span>{label}</span>
      <div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
        <button className="icon-button" type="button" aria-label={visible ? "隐藏密钥" : "显示密钥"} onClick={onToggle}>
          <AppIcon icon={visible ? statusIcons.neutral : actionIcons.privacyPolicy} size="sm" />
        </button>
      </div>
    </label>
  );
}

type TimelineItem = {
  title: string;
  meta: string;
  detail: string;
  tone?: StatusTone;
};

type TimelineProps = {
  items: TimelineItem[];
};

export function Timeline({ items }: TimelineProps) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={`${item.title}-${item.meta}`} className={`timeline__item timeline__item--${item.tone ?? "neutral"}`}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.meta}</span>
          </div>
          <p>{item.detail}</p>
        </li>
      ))}
    </ol>
  );
}

type InlineNoticeProps = {
  tone: "warning" | "info" | "success";
  title: string;
  children: ReactNode;
};

export function InlineNotice({ tone, title, children }: InlineNoticeProps) {
  return (
    <aside className={`warning-box warning-box--${tone}`}>
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  );
}

type RowActionButtonProps = {
  disabled?: boolean;
  title?: string | undefined;
  children: ReactNode;
  onClick: () => void;
};

export function RowActionButton({ disabled = false, title, children, onClick }: RowActionButtonProps) {
  return (
    <button
      className="action-button action-button--compact"
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
      <AppIcon icon={commonUiIcons.arrowRight} size="sm" />
    </button>
  );
}
