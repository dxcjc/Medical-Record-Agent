import type { ReactNode } from "react";
import { Alert, Button, Card, Input, Modal, Space, Tag, Timeline as ArcoTimeline } from "@arco-design/web-react";
import { AppIcon, actionIcons, commonUiIcons, statusIcons } from "../../../icons/appIcons";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader({ eyebrow, title, description, meta, actions }: SectionHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
        {meta}
      </div>
      {actions ? <div className="page-header__actions u-cluster">{actions}</div> : null}
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
    <Card className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </Card>
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
  const colorMap: Record<StatusTone, string> = {
    success: "green",
    warning: "orange",
    danger: "red",
    info: "arcoblue",
    neutral: "gray",
  };

  return (
    <Tag color={colorMap[tone]} className={`status-pill status-pill--${tone}`}>
      {statusIconMap[tone]}
      {children}
    </Tag>
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
  return (
    <Modal
      visible={open}
      title={title}
      okText={confirmLabel}
      cancelText="取消"
      {...(danger ? { okButtonProps: { status: "danger" as const } } : {})}
      onCancel={onCancel}
      onOk={onConfirm}
    >
      <p>{description}</p>
    </Modal>
  );
}

type PayloadPreviewProps = {
  title: string;
  payload: unknown;
};

export function PayloadPreview({ title, payload }: PayloadPreviewProps) {
  return (
    <Card className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre>
    </Card>
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
        <Input
          type={visible ? "text" : "password"}
          value={value}
          autoComplete="off"
          onChange={onChange}
        />
        <Button type="text" icon={<AppIcon icon={visible ? statusIcons.neutral : actionIcons.privacyPolicy} size="sm" />} aria-label={visible ? "隐藏密钥" : "显示密钥"} onClick={onToggle}>
          <AppIcon icon={visible ? statusIcons.neutral : actionIcons.privacyPolicy} size="sm" />
        </Button>
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
    <ArcoTimeline className="timeline">
      {items.map((item) => (
        <ArcoTimeline.Item key={`${item.title}-${item.meta}`} label={item.meta}>
          <div className={`timeline__item timeline__item--${item.tone ?? "neutral"}`}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </ArcoTimeline.Item>
      ))}
    </ArcoTimeline>
  );
}

type InlineNoticeProps = {
  tone: "warning" | "info" | "success";
  title: string;
  children: ReactNode;
};

export function InlineNotice({ tone, title, children }: InlineNoticeProps) {
  const alertType = tone === "warning" ? "warning" : tone === "success" ? "success" : "info";

  return (
    <Alert className={`warning-box warning-box--${tone}`} type={alertType} showIcon title={title} content={children} />
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
    <Button
      type="primary"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <Space size={6}>
        {children}
        <AppIcon icon={commonUiIcons.arrowRight} size="sm" />
      </Space>
    </Button>
  );
}
