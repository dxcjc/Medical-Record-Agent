import React from 'react';
import { Empty, Button } from '@arco-design/web-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Empty description={title || '暂无数据'} />
      {description && (
        <div style={{ color: 'var(--color-text-3)', fontSize: 13, marginTop: 4, marginBottom: action ? 16 : 0 }}>
          {description}
        </div>
      )}
      {action && (
        <Button type="primary" onClick={action.onClick} style={{ marginTop: 16 }}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
