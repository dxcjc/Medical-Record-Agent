import React from 'react';
import { Button } from '@arco-design/web-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          {icon}
        </div>
      )}
      <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24, maxWidth: 360 }}>
          {description}
        </p>
      )}
      {action && (
        <Button type="primary" size="large" icon={action.icon} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
