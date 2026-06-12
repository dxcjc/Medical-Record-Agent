import React from 'react';
import { Spin } from '@arco-design/web-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  loading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color = 'var(--color-primary)', loading }) => {
  return (
    <div style={{
      background: 'var(--color-bg-white)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-card)',
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flex: 1,
      minWidth: 200,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{title}</div>
        {loading ? (
          <Spin size={20} />
        ) : (
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
