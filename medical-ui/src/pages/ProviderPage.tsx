import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Message,
  Typography,
  Space,
  Descriptions,
} from '@arco-design/web-react';
import {
  useProviders,
  useSetDefaultProvider,
  useCheckProviderHealth,
} from '../hooks/useProviders';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import type { ProviderConfig } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;

export default function ProviderPage() {
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
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size={40} />
        </div>
      </Card>
    );
  }

  if (providers.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Provider 管理"
          subtitle="管理 OCR 和 LLM Provider"
          onRefresh={() => refetch()}
        />
        <Card>
          <EmptyState
            title="暂无 Provider"
            description="请联系管理员配置 Provider"
            action={{ label: '刷新', onClick: () => refetch() }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="配置管理"
        title="Provider 管理"
        subtitle={`共 ${providers.length} 个 Provider`}
        onRefresh={() => refetch()}
      />

      <Row gutter={[16, 16]}>
        {providers.map((p: ProviderConfig) => (
          <Col key={p.id} span={8}>
            <Card style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Space>
                  <Title heading={6} style={{ margin: 0 }}>{p.displayName}</Title>
                  {p.isDefault && <Tag color="blue">默认</Tag>}
                </Space>
                <Tag color={p.status === 'active' ? 'green' : 'gray'}>
                  {p.status === 'active' ? '启用' : '禁用'}
                </Tag>
              </div>

              <Tag
                color={p.kind === 'ocr' ? 'blue' : p.kind === 'llm' ? 'purple' : 'gray'}
                style={{ marginBottom: 16 }}
              >
                {p.kind.toUpperCase()}
              </Tag>

              <Descriptions
                column={1}
                data={[
                  { label: 'Key', value: p.key },
                  { label: '创建时间', value: new Date(p.createdAt).toLocaleString('zh-CN') },
                ]}
                style={{ marginBottom: 16 }}
              />

              <Space>
                {!p.isDefault && (
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => handleSetDefault(p.key)}
                    loading={setDefaultMutation.isPending}
                  >
                    设为默认
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={() => handleHealthCheck(p.key)}
                  loading={healthCheckMutation.isPending}
                >
                  健康检查
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
