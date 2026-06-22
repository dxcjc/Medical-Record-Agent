import { Card, Space, Statistic } from '@arco-design/web-react';
import type { AppIcon } from '../icons/appIcons';

type MetricCardProps = {
  title: string;
  value: number | string;
  icon: AppIcon;
  tone?: 'blue' | 'green' | 'amber' | 'red';
  delta?: string;
  hint?: string;
  loading?: boolean;
};

const toneStyles: Record<string, { color: string; background: string }> = {
  blue: { color: 'var(--color-primary)', background: 'var(--color-primary-soft)' },
  green: { color: 'var(--color-success)', background: 'var(--color-success-soft)' },
  amber: { color: 'var(--color-warning)', background: 'var(--color-warning-soft)' },
  red: { color: 'var(--color-danger)', background: 'var(--color-danger-soft)' },
};

export default function MetricCard({ title, value, icon: Icon, tone = 'blue', delta, hint, loading }: MetricCardProps) {
  const style = toneStyles[tone] || toneStyles.blue;

  return (
    <Card size="small" style={{ height: '100%' }}>
      <Space align="start" size={12}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: style.color,
            background: style.background,
          }}
        >
          <Icon size={18} />
        </span>
        <Statistic
          title={title}
          value={value}
          loading={loading}
          extra={delta ? `${delta}${hint ? ` · ${hint}` : ''}` : hint}
          styleValue={{ fontSize: 24, fontWeight: 700 }}
        />
      </Space>
    </Card>
  );
}
