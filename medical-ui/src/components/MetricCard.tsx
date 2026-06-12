import React from 'react';
import { Card, Statistic } from '@arco-design/web-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  loading?: boolean;
  style?: React.CSSProperties;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, loading, style }) => {
  return (
    <Card hoverable style={style}>
      <Statistic
        title={title}
        value={value}
        loading={loading}
        extra={icon}
      />
    </Card>
  );
};

export default MetricCard;
