import React from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Message,
} from '@arco-design/web-react';
import { IconRefresh, IconCheck } from '@arco-design/web-react/icon';
import {
  useProviders,
  useSetDefaultProvider,
  useCheckProviderHealth,
} from '../hooks/useProviders';
import EmptyState from '../components/EmptyState';
import type { ProviderConfig } from '../api/types';

const { Row, Col } = Grid;

const ProviderPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useProviders();
  const setDefaultMutation = useSetDefaultProvider();
  const healthCheckMutation = useCheckProviderHealth();

  const providers = data?.items || [];

  const handleSetDefault = async (key: string) => {
    try {
      await setDefaultMutation.mutateAsync(key);
      Message.success('已设为默认');
    } catch {
      Message.error('设置失败');
    }
  };

  const handleHealthCheck = async (key: string) => {
    try {
      const res = await healthCheckMutation.mutateAsync(key);
      if (res.health.healthy) {
        Message.success(`${key} 健康 (${res.health.latency}ms)`);
      } else {
        Message.warning(`${key} 异常: ${res.health.message || '未知'}`);
      }
    } catch {
      Message.error('健康检查失败');
    }
  };

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size={40} />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <EmptyState
        title="暂无 Provider"
        description="请联系管理员配置 Provider"
        action={{ label: '刷新', onClick: () => refetch() }}
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          共 {providers.length} 个 Provider
        </span>
        <Button icon={<IconRefresh />} onClick={() => refetch()} size="small">
          刷新
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {providers.map((p: ProviderConfig) => (
          <Col key={p.id} span={8}>
            <Card
              bordered={false}
              style={{ height: '100%' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>
                    {p.displayName}
                  </span>
                  {p.isDefault && (
                    <Tag color="blue" size="small">默认</Tag>
                  )}
                </div>
                <Tag
                  color={p.status === 'active' ? 'green' : 'gray'}
                  size="small"
                >
                  {p.status === 'active' ? '启用' : '禁用'}
                </Tag>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Tag
                  color={p.kind === 'ocr' ? 'blue' : p.kind === 'llm' ? 'purple' : 'gray'}
                  size="small"
                >
                  {p.kind.toUpperCase()}
                </Tag>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 16,
                }}
              >
                Key: {p.key}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {!p.isDefault && (
                  <Button
                    size="small"
                    onClick={() => handleSetDefault(p.key)}
                    loading={setDefaultMutation.isPending}
                  >
                    设为默认
                  </Button>
                )}
                <Button
                  size="small"
                  type="outline"
                  onClick={() => handleHealthCheck(p.key)}
                  loading={healthCheckMutation.isPending}
                >
                  健康检查
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default ProviderPage;
