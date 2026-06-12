import { Empty, Button } from '@arco-design/web-react';

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Empty description={title || '暂无数据'} />
      {description && (
        <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4, marginBottom: action ? 16 : 0 }}>
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
}
