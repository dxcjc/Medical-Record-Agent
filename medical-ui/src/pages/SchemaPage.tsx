import { useState } from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Message,
  Table,
  Descriptions,
  Typography,
  Space,
  List,
} from '@arco-design/web-react';
import { useSchemas, useDeactivateSchemaVersion, useRollbackSchemaVersion } from '../hooks/useSchemas';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import type { SchemaVersion, SchemaField } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;

export default function SchemaPage() {
  const { data, isLoading, error, refetch } = useSchemas();
  const deactivateMutation = useDeactivateSchemaVersion();
  const rollbackMutation = useRollbackSchemaVersion();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const schemas = data?.items || [];
  const selected = schemas.find((s) => s.id === selectedId) || null;

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateMutation.mutateAsync(id);
      Message.success('已停用');
    } catch {
      Message.error('操作失败');
    }
  };

  const handleRollback = async (id: string) => {
    try {
      await rollbackMutation.mutateAsync(id);
      Message.success('已回滚');
    } catch {
      Message.error('操作失败');
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

  if (schemas.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Schema 管理"
          subtitle="管理识别 Schema 版本"
          onRefresh={() => refetch()}
        />
        <Card>
          <EmptyState
            title="暂无 Schema"
            description="请联系管理员配置识别 Schema"
            action={{ label: '刷新', onClick: () => refetch() }}
          />
        </Card>
      </div>
    );
  }

  const fields: SchemaField[] = selected?.definition?.fields || [];

  const fieldColumns = [
    { title: 'Key', dataIndex: 'key', width: 150 },
    { title: '标签', dataIndex: 'label', width: 150 },
    { title: '类型', dataIndex: 'type', width: 100 },
    {
      title: '必填',
      dataIndex: 'required',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <Tag>否</Tag>),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="配置管理"
        title="Schema 管理"
        subtitle={`共 ${schemas.length} 个 Schema 版本`}
        onRefresh={() => refetch()}
      />

      <Row gutter={16}>
        {/* Left Panel - Schema List */}
        <Col span={7}>
          <Card bodyStyle={{ padding: 0 }}>
            <List
              dataSource={schemas}
              render={(s: SchemaVersion) => (
                <List.Item
                  key={s.id}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === s.id ? 'var(--color-primary-soft)' : undefined,
                    padding: '12px 20px',
                  }}
                  onClick={() => setSelectedId(s.id)}
                >
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13 }}>{s.displayName}</Text>
                        <StatusTag status={s.status} />
                      </div>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        v{s.version} · {s.schemaKey}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* Right Panel - Detail */}
        <Col span={17}>
          <Card style={{ minHeight: 400 }}>
            {!selected ? (
              <EmptyState title="请在左侧选择一个 Schema 查看详情" />
            ) : (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Title heading={5} style={{ marginBottom: 4 }}>{selected.displayName}</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {selected.schemaKey} · v{selected.version}
                    </Text>
                  </div>
                  <Space>
                    <Button
                      size="small"
                      status="warning"
                      loading={deactivateMutation.isPending}
                      onClick={() => handleDeactivate(selected.id)}
                      disabled={selected.status === 'inactive'}
                    >
                      停用
                    </Button>
                    <Button
                      size="small"
                      loading={rollbackMutation.isPending}
                      onClick={() => handleRollback(selected.id)}
                    >
                      回滚
                    </Button>
                  </Space>
                </div>

                <Descriptions
                  column={3}
                  data={[
                    { label: '版本', value: String(selected.version) },
                    { label: '状态', value: <StatusTag status={selected.status} /> },
                    {
                      label: '发布时间',
                      value: selected.publishedAt
                        ? new Date(selected.publishedAt).toLocaleString('zh-CN')
                        : '-',
                    },
                    ...(selected.changelog
                      ? [{ label: '变更说明', value: selected.changelog }]
                      : []),
                  ]}
                />

                <div>
                  <Title heading={6} style={{ marginBottom: 12 }}>字段定义</Title>
                  {fields.length === 0 ? (
                    <Text type="secondary">暂无字段定义</Text>
                  ) : (
                    <Table
                      columns={fieldColumns}
                      data={fields.map((f, i) => ({ ...f, _key: f.key || i }))}
                      rowKey="_key"
                      pagination={false}
                      size="small"
                      border={false}
                    />
                  )}
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
