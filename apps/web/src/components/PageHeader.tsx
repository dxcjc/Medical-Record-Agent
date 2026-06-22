import { Button, Space, Typography } from '@arco-design/web-react';
import { IconFileUp, IconRefresh } from '../icons/appIcons';

const { Title, Text } = Typography;

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
  onRefresh?: () => void;
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onAction,
  onRefresh,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
          {eyebrow}
        </Text>
        <Title heading={4} style={{ margin: '8px 0 4px' }}>
          {title}
        </Title>
        <Text type="secondary">{subtitle}</Text>
      </div>
      <Space>
        {onRefresh && (
          <Button icon={<IconRefresh />} onClick={onRefresh}>
            刷新
          </Button>
        )}
        {action && onAction && (
          <Button type="primary" icon={<IconFileUp />} onClick={onAction}>
            {action}
          </Button>
        )}
      </Space>
    </div>
  );
}
