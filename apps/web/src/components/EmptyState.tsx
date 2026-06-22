import { Empty, Button } from '@arco-design/web-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  /** 主标题（默认：暂无数据） */
  title?: string;
  /** 描述文案 */
  description?: string;
  /** 自定义图标（默认使用 Arco Empty 的内置图标） */
  icon?: ReactNode;
  /** 操作按钮 */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** 次要操作 */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** 自定义样式 */
  style?: React.CSSProperties;
};

export default function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  style,
}: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        maxWidth: 400,
        margin: '0 auto',
        ...style,
      }}
    >
      {icon ? (
        <div style={{ marginBottom: 16, opacity: 0.45 }}>{icon}</div>
      ) : (
        <Empty description={null} />
      )}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-title)',
          marginTop: icon ? 0 : 12,
          marginBottom: 4,
        }}
      >
        {title || '暂无数据'}
      </div>
      {description && (
        <div
          style={{
            color: 'var(--color-muted)',
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: action || secondaryAction ? 20 : 0,
          }}
        >
          {description}
        </div>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {action && (
            <Button type="primary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button type="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
